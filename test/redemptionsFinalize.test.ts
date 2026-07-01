import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { InMemoryRedemptionRepository } from '../src/adapters/inMemoryRedemptionRepository';
import {
  finalizeRedemption,
  reassignRedemption,
  findUnassignedTooLong,
  type FinalizeDeps,
} from '../src/domain/redemptions';
import type { RedemptionStatus } from '../src/ports/redemptionRepository';

const ORIGIN = 'square_pos_other_tender' as const;

function setup() {
  const repo = new InMemoryLedgerRepository();
  const ledger = new Ledger(repo);
  const redemptions = new InMemoryRedemptionRepository();
  const deps: FinalizeDeps = { ledger, redemptions };
  return { repo, ledger, redemptions, deps };
}

async function seedCredit(ledger: Ledger, customerId: string, cents: number) {
  await ledger.issueCredit({ customerId, amountCents: cents, idempotencyKey: `seed:${customerId}` });
}

function redeemCount(repo: InMemoryLedgerRepository, customerId: string): number {
  return repo.allEntries().filter((e) => e.customerId === customerId && e.kind === 'REDEEM').length;
}

test('finalizeRedemption: calling twice with the same payment id posts exactly one ledger entry', async () => {
  const { repo, ledger, redemptions, deps } = setup();
  await seedCredit(ledger, 'cust-A', 1000);

  const row = await redemptions.create({
    amountCents: 300,
    origin: ORIGIN,
    squarePaymentId: 'pay_1',
    locationId: 'loc-1',
  });

  const first = await finalizeRedemption(
    { redemptionId: row.id, customerId: 'cust-A', amountCents: 300, squarePaymentId: 'pay_1', origin: ORIGIN },
    deps,
  );
  assert.equal(first.ok, true);
  assert.equal(await ledger.getBalance('cust-A'), 700);

  const second = await finalizeRedemption(
    { redemptionId: row.id, customerId: 'cust-A', amountCents: 300, squarePaymentId: 'pay_1', origin: ORIGIN },
    deps,
  );
  assert.equal(second.ok, true);
  assert.ok(second.ok && second.alreadyFinalized, 'second call is an idempotent no-op');
  assert.ok(first.ok && second.ok && first.ledgerEntryId === second.ledgerEntryId);

  // The real guarantee: one REDEEM on the ledger, balance dropped once.
  assert.equal(redeemCount(repo, 'cust-A'), 1);
  assert.equal(await ledger.getBalance('cust-A'), 700);

  const finalizedRow = await redemptions.getById(row.id);
  assert.equal(finalizedRow?.status, 'finalized');
  assert.equal(finalizedRow?.customerId, 'cust-A');
});

test('finalizeRedemption: over-balance without allowNegative returns needsConfirm and posts nothing', async () => {
  const { repo, ledger, redemptions, deps } = setup();
  await seedCredit(ledger, 'cust-B', 500);

  const row = await redemptions.create({
    amountCents: 900,
    origin: ORIGIN,
    squarePaymentId: 'pay_2',
    locationId: 'loc-1',
  });

  const res = await finalizeRedemption(
    { redemptionId: row.id, customerId: 'cust-B', amountCents: 900, squarePaymentId: 'pay_2', origin: ORIGIN },
    deps,
  );
  assert.equal(res.ok, false);
  assert.ok(!res.ok && res.needsConfirm);
  assert.ok(!res.ok && res.available === 500);

  // Nothing drawn, row still open.
  assert.equal(redeemCount(repo, 'cust-B'), 0);
  assert.equal(await ledger.getBalance('cust-B'), 500);
  assert.equal((await redemptions.getById(row.id))?.status, 'awaiting_attribution');
});

test('finalizeRedemption: over-balance with allowNegative finalizes and flags the negative', async () => {
  const { ledger, redemptions, deps } = setup();
  await seedCredit(ledger, 'cust-B', 500);

  const row = await redemptions.create({
    amountCents: 900,
    origin: ORIGIN,
    squarePaymentId: 'pay_2',
    locationId: 'loc-1',
  });

  const res = await finalizeRedemption(
    { redemptionId: row.id, customerId: 'cust-B', amountCents: 900, squarePaymentId: 'pay_2', origin: ORIGIN, allowNegative: true },
    deps,
  );
  assert.ok(res.ok && res.negativeBalance, 'finalizes with the negative flag');
  assert.equal(await ledger.getBalance('cust-B'), -400);

  const finalized = await redemptions.getById(row.id);
  assert.equal(finalized?.status, 'finalized');
  assert.deepEqual(finalized?.flags, { negative_balance: true });
});

test('findUnassignedTooLong: only awaiting rows older than the threshold surface', () => {
  const asOf = '2026-07-01T12:00:00.000Z';
  const rows: { id: string; status: RedemptionStatus; createdAt: string }[] = [
    { id: 'old', status: 'awaiting_attribution', createdAt: '2026-07-01T11:00:00.000Z' }, // 60m
    { id: 'fresh', status: 'awaiting_attribution', createdAt: '2026-07-01T11:59:00.000Z' }, // 1m
    { id: 'finalized', status: 'finalized', createdAt: '2026-07-01T09:00:00.000Z' }, // not awaiting
  ];
  const out = findUnassignedTooLong(rows, asOf, 30 * 60 * 1000);
  assert.deepEqual(out.map((r) => r.id), ['old']);
});

test('reassignRedemption: reverses the wrong customer and re-draws the corrected one (attempt-scoped key)', async () => {
  const { ledger, redemptions, deps } = setup();
  await seedCredit(ledger, 'cust-wrong', 1000);
  await seedCredit(ledger, 'cust-right', 1000);

  const row = await redemptions.create({
    amountCents: 400,
    origin: ORIGIN,
    squarePaymentId: 'pay_3',
    locationId: 'loc-1',
  });

  // Assign to the wrong customer.
  await finalizeRedemption(
    { redemptionId: row.id, customerId: 'cust-wrong', amountCents: 400, squarePaymentId: 'pay_3', origin: ORIGIN },
    deps,
  );
  assert.equal(await ledger.getBalance('cust-wrong'), 600);

  // Reassign: reverse + re-queue.
  const requeued = await reassignRedemption(row.id, deps);
  assert.equal(requeued.status, 'awaiting_attribution');
  assert.equal(requeued.attributionAttempt, 2);
  assert.equal(await ledger.getBalance('cust-wrong'), 1000, 'wrong customer made whole');

  // Assign to the correct customer — the bumped attempt frees the ledger key.
  const res = await finalizeRedemption(
    { redemptionId: row.id, customerId: 'cust-right', amountCents: 400, squarePaymentId: 'pay_3', origin: ORIGIN },
    deps,
  );
  assert.ok(res.ok);
  assert.equal(await ledger.getBalance('cust-right'), 600, 'corrected customer actually charged');
  assert.equal(await ledger.getBalance('cust-wrong'), 1000);

  const finalized = await redemptions.getById(row.id);
  assert.equal(finalized?.status, 'finalized');
  assert.equal(finalized?.customerId, 'cust-right');
});
