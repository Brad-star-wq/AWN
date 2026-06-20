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
  findStalePendings,
  RedemptionSignal,
} from '../src/adapters/square/matcher';

const LOC = 'L_MAIN';
const T = '2026-06-19T15:00:00.000Z';
/** 6 minutes after T — inside the ±10min window. */
const T_PLUS_6 = '2026-06-19T15:06:00.000Z';
/** 20 minutes after T — outside the window. */
const T_PLUS_20 = '2026-06-19T15:20:00.000Z';

function setup(openingCreditCents = 5000) {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_1', displayName: 'Marcus' });
  const ledger = new Ledger(repo);
  const pendings = new InMemoryPendingRedemptionStore();
  const events = new InMemoryWebhookEventStore();
  return { repo, ledger, pendings, events, openingCreditCents };
}

function signal(over: Partial<RedemptionSignal> = {}): RedemptionSignal {
  return {
    paymentId: 'sqpay_1',
    amountCents: 2000,
    locationId: LOC,
    occurredAt: T_PLUS_6,
    ...over,
  };
}

test('unique match finalizes the ledger and reconciles the pending', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  const pending = await pendings.create({
    customerId: 'cust_1',
    amountCents: 2000,
    locationId: LOC,
    createdAt: T,
  });

  const outcome = await reconcilePayment('evt_1', signal(), { ledger, pendings, events });

  assert.equal(outcome.kind, 'RECONCILED');
  assert.equal(await ledger.getBalance('cust_1'), 3000); // 5000 - 2000
  const after = await pendings.get(pending.id);
  assert.equal(after?.status, 'RECONCILED');
  assert.equal(after?.reconciledPaymentId, 'sqpay_1');
  assert.ok(after?.ledgerEntryId);
});

test('a re-delivered event is a no-op and never double-deducts', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  const first = await reconcilePayment('evt_1', signal(), { ledger, pendings, events });
  const replay = await reconcilePayment('evt_1', signal(), { ledger, pendings, events });

  assert.equal(first.kind, 'RECONCILED');
  assert.equal(replay.kind, 'DUPLICATE');
  assert.equal(await ledger.getBalance('cust_1'), 3000); // deducted exactly once
});

test('even a NEW event id cannot double-deduct (ledger idempotent on payment id)', async () => {
  // Defense in depth: if dedupe were bypassed, the ledger's idempotency key on
  // the Square payment id still prevents a second REDEEM for the same payment.
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  const first = await reconcilePayment('evt_1', signal(), { ledger, pendings, events });
  assert.equal(first.kind, 'RECONCILED');
  assert.equal(await ledger.getBalance('cust_1'), 3000);

  // A second, distinct pending opens, then the SAME payment arrives under a new
  // event id (dedupe bypassed). It matches uniquely, but redeemCredit is keyed
  // on the payment id, so it returns the existing entry — no second deduction.
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  const replay = await reconcilePayment('evt_2', signal(), { ledger, pendings, events });
  assert.equal(replay.kind, 'RECONCILED');
  assert.equal(await ledger.getBalance('cust_1'), 3000); // still one deduction
});

test('no matching pending surfaces NO_PENDING (Square sale, no app redemption)', async () => {
  const { ledger, pendings, events } = setup();
  const outcome = await reconcilePayment('evt_1', signal(), { ledger, pendings, events });
  assert.equal(outcome.kind, 'NO_PENDING');
});

test('amount mismatch does not match', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2500, locationId: LOC, createdAt: T });
  const outcome = await reconcilePayment('evt_1', signal({ amountCents: 2000 }), {
    ledger,
    pendings,
    events,
  });
  assert.equal(outcome.kind, 'NO_PENDING');
});

test('location mismatch does not match', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: 'L_OTHER', createdAt: T });
  const outcome = await reconcilePayment('evt_1', signal({ locationId: LOC }), {
    ledger,
    pendings,
    events,
  });
  assert.equal(outcome.kind, 'NO_PENDING');
});

test('outside the time window does not match', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  const outcome = await reconcilePayment('evt_1', signal({ occurredAt: T_PLUS_20 }), {
    ledger,
    pendings,
    events,
  });
  assert.equal(outcome.kind, 'NO_PENDING');
});

test('two pendings with the same amount in the window flag AMBIGUOUS, not a guess', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T_PLUS_6 });

  const outcome = await reconcilePayment('evt_1', signal(), { ledger, pendings, events });

  assert.equal(outcome.kind, 'AMBIGUOUS');
  if (outcome.kind === 'AMBIGUOUS') assert.equal(outcome.candidates.length, 2);
  // Nothing finalized; both pendings stay open for human resolution.
  assert.equal(await ledger.getBalance('cust_1'), 5000);
  assert.equal((await pendings.listOpen()).length, 2);
});

test('findStalePendings surfaces pendings whose window elapsed with no payment', async () => {
  const { pendings } = setup();
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  await pendings.create({ customerId: 'cust_1', amountCents: 3000, locationId: LOC, createdAt: T_PLUS_20 });

  // As of 15 min after the first pending: the first is stale, the second isn't.
  const stale = await findStalePendings(pendings, '2026-06-19T15:15:00.000Z');
  assert.equal(stale.length, 1);
  assert.equal(stale[0]?.amountCents, 2000);
});

test('a reconciled pending is no longer open for matching', async () => {
  const { ledger, pendings, events } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  await reconcilePayment('evt_1', signal(), { ledger, pendings, events });
  assert.equal((await pendings.listOpen()).length, 0);
});
