import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import {
  InMemoryPendingRedemptionStore,
  InMemoryWebhookEventStore,
} from '../src/adapters/square/pendingRedemptions';
import {
  reconcilePayment,
  reverseRefund,
  RefundSignal,
  RedemptionSignal,
} from '../src/adapters/square/matcher';

const LOC = 'L_MAIN';
const T = '2026-06-19T15:00:00.000Z';
const T_PLUS_6 = '2026-06-19T15:06:00.000Z';
const T_REFUND = '2026-06-19T16:00:00.000Z';

function setup() {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_1', displayName: 'Marcus' });
  repo.addCustomer({ id: 'cust_2', displayName: 'Priya' });
  const ledger = new Ledger(repo);
  const pendings = new InMemoryPendingRedemptionStore();
  const events = new InMemoryWebhookEventStore();
  return { repo, ledger, pendings, events };
}

const paySignal = (over: Partial<RedemptionSignal> = {}): RedemptionSignal => ({
  paymentId: 'sqpay_1',
  amountCents: 2000,
  locationId: LOC,
  occurredAt: T_PLUS_6,
  ...over,
});

const refundSignal = (over: Partial<RefundSignal> = {}): RefundSignal => ({
  refundId: 'sqref_1',
  paymentId: 'sqpay_1',
  amountCents: 2000,
  occurredAt: T_REFUND,
  ...over,
});

/** Reconcile a redemption first, so there is something to refund. */
async function reconcileFirst(deps: ReturnType<typeof setup>) {
  await deps.ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  const outcome = await reconcilePayment('evt_pay', paySignal(), deps);
  assert.equal(outcome.kind, 'RECONCILED');
  assert.equal(await deps.ledger.getBalance('cust_1'), 3000);
}

test('a refund returns credit to the right customer', async () => {
  const deps = setup();
  await reconcileFirst(deps);

  const outcome = await reverseRefund('evt_refund', refundSignal(), deps);

  assert.equal(outcome.kind, 'REVERSED');
  assert.equal(await deps.ledger.getBalance('cust_1'), 5000); // 3000 + 2000 back
  assert.equal(await deps.ledger.getBalance('cust_2'), 0); // untouched
  if (outcome.kind === 'REVERSED') {
    assert.equal(outcome.ledgerEntry.kind, 'REVERSAL');
    assert.equal(outcome.ledgerEntry.deltaCents, 2000); // positive
    assert.equal(outcome.pending.customerId, 'cust_1');
  }
});

test('a partial refund returns only the refunded amount', async () => {
  const deps = setup();
  await reconcileFirst(deps);

  const outcome = await reverseRefund('evt_refund', refundSignal({ amountCents: 500 }), deps);

  assert.equal(outcome.kind, 'REVERSED');
  assert.equal(await deps.ledger.getBalance('cust_1'), 3500); // 3000 + 500
});

test('a re-delivered refund event does not return credit twice', async () => {
  const deps = setup();
  await reconcileFirst(deps);

  const first = await reverseRefund('evt_refund', refundSignal(), deps);
  const replay = await reverseRefund('evt_refund', refundSignal(), deps);

  assert.equal(first.kind, 'REVERSED');
  assert.equal(replay.kind, 'DUPLICATE');
  assert.equal(await deps.ledger.getBalance('cust_1'), 5000); // returned exactly once
});

test('even a new event id cannot return credit twice (ledger idempotent on refund id)', async () => {
  const deps = setup();
  await reconcileFirst(deps);

  await reverseRefund('evt_refund_a', refundSignal(), deps);
  await reverseRefund('evt_refund_b', refundSignal(), deps); // same refund id, dedupe bypassed

  assert.equal(await deps.ledger.getBalance('cust_1'), 5000); // still one reversal
});

test('a refund for a payment we never reconciled is surfaced, not blindly credited', async () => {
  const deps = setup();
  // No reconciliation happened; nobody should be credited.
  const outcome = await reverseRefund('evt_refund', refundSignal({ paymentId: 'sqpay_unknown' }), deps);

  assert.equal(outcome.kind, 'NO_RECONCILED_REDEMPTION');
  assert.equal(await deps.ledger.getBalance('cust_1'), 0);
  assert.equal(await deps.ledger.getBalance('cust_2'), 0);
});
