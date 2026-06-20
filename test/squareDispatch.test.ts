import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import {
  InMemoryPendingRedemptionStore,
  InMemoryWebhookEventStore,
} from '../src/adapters/square/pendingRedemptions';
import { InMemoryAlertStore } from '../src/adapters/square/alerts';
import { processSquareEvent } from '../src/adapters/square/dispatch';
import { parsePaymentEvent, parseRefundEvent } from '../src/adapters/square/parseEvent';

const LOC = 'L_SANDBOX';
const T = '2026-06-19T15:00:00.000Z';
const T6 = '2026-06-19T15:06:00.000Z';

function setup() {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_1', displayName: 'Marcus' });
  const ledger = new Ledger(repo);
  const deps = {
    pendings: new InMemoryPendingRedemptionStore(),
    events: new InMemoryWebhookEventStore(),
    alerts: new InMemoryAlertStore(),
    ledger,
  };
  return { ledger, deps };
}

// ---- Square payload fixtures (shape of real webhook envelopes) ----

function paymentEvent(opts: {
  eventId?: string;
  status?: string;
  amount?: number;
  location?: string;
  occurredAt?: string;
  external?: boolean;
}) {
  const payment: Record<string, unknown> = {
    id: 'sqpay_1',
    status: opts.status ?? 'COMPLETED',
    location_id: opts.location ?? LOC,
    amount_money: { amount: opts.amount ?? 2000, currency: 'USD' },
    created_at: opts.occurredAt ?? T6,
    updated_at: opts.occurredAt ?? T6,
    source_type: opts.external === false ? 'CARD' : 'EXTERNAL',
  };
  return {
    event_id: opts.eventId ?? 'evt_pay_1',
    type: 'payment.updated',
    data: { type: 'payment', object: { payment } },
  };
}

function refundEvent(opts: { eventId?: string; status?: string; amount?: number; paymentId?: string }) {
  const refund: Record<string, unknown> = {
    id: 'sqref_1',
    payment_id: opts.paymentId ?? 'sqpay_1',
    status: opts.status ?? 'COMPLETED',
    amount_money: { amount: opts.amount ?? 2000, currency: 'USD' },
    created_at: '2026-06-19T16:00:00.000Z',
    updated_at: '2026-06-19T16:00:00.000Z',
  };
  return { event_id: opts.eventId ?? 'evt_ref_1', type: 'refund.updated', data: { object: { refund } } };
}

// ---- parse layer ----

test('parse ignores a non-COMPLETED payment (the early created event)', () => {
  assert.equal(parsePaymentEvent(paymentEvent({ status: 'APPROVED' })), null);
});

test('parse ignores a non-OTHER (card) payment', () => {
  assert.equal(parsePaymentEvent(paymentEvent({ external: false })), null);
});

test('parse reads amount/location/time from a COMPLETED external payment', () => {
  const sig = parsePaymentEvent(paymentEvent({}));
  assert.deepEqual(sig, { paymentId: 'sqpay_1', amountCents: 2000, locationId: LOC, occurredAt: T6 });
});

test('parse reads an explicit OTHER tender array when present', () => {
  const ev = paymentEvent({});
  const payment = (ev.data.object as { payment: Record<string, unknown> }).payment;
  delete payment.source_type;
  payment.tenders = [
    { type: 'CARD', amount_money: { amount: 500 } },
    { type: 'OTHER', amount_money: { amount: 2000 } },
  ];
  const sig = parsePaymentEvent(ev);
  assert.equal(sig?.amountCents, 2000); // only the OTHER tender counts
});

test('parse ignores a non-COMPLETED refund', () => {
  assert.equal(parseRefundEvent(refundEvent({ status: 'PENDING' })), null);
});

// ---- dispatch layer (real Ledger + in-memory stores) ----

test('a COMPLETED OTHER payment reconciles a matching pending and posts the ledger', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  const result = await processSquareEvent(paymentEvent({}), deps);

  assert.equal(result.kind, 'PAYMENT');
  if (result.kind === 'PAYMENT') assert.equal(result.outcome.kind, 'RECONCILED');
  assert.equal(await ledger.getBalance('cust_1'), 3000);
  assert.equal((await deps.alerts.listOpen()).length, 0);
});

test('the early created event is ignored; only COMPLETED acts', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  const created = await processSquareEvent(
    { event_id: 'evt_created', type: 'payment.created', data: { object: { payment: { id: 'sqpay_1', status: 'APPROVED' } } } },
    deps,
  );
  assert.equal(created.kind, 'IGNORED');
  assert.equal(await ledger.getBalance('cust_1'), 5000); // nothing finalized yet

  const completed = await processSquareEvent(paymentEvent({ eventId: 'evt_completed' }), deps);
  assert.equal(completed.kind, 'PAYMENT');
  assert.equal(await ledger.getBalance('cust_1'), 3000);
});

test('an OTHER payment with no pending records a NO_PENDING alert', async () => {
  const { ledger, deps } = setup();
  const result = await processSquareEvent(paymentEvent({}), deps);

  assert.equal(result.kind, 'PAYMENT');
  if (result.kind === 'PAYMENT') assert.equal(result.outcome.kind, 'NO_PENDING');
  const alerts = await deps.alerts.listOpen();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.kind, 'NO_PENDING');
  assert.equal(alerts[0]?.amountCents, 2000);
  assert.equal(await ledger.getBalance('cust_1'), 0);
});

test('a refund reverses credit to the right customer', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  await processSquareEvent(paymentEvent({}), deps); // reconcile first → 3000
  assert.equal(await ledger.getBalance('cust_1'), 3000);

  const result = await processSquareEvent(refundEvent({}), deps);

  assert.equal(result.kind, 'REFUND');
  if (result.kind === 'REFUND') assert.equal(result.outcome.kind, 'REVERSED');
  assert.equal(await ledger.getBalance('cust_1'), 5000); // credit back
});

test('a refund for an unreconciled payment records a REFUND_NO_REDEMPTION alert', async () => {
  const { deps } = setup();
  const result = await processSquareEvent(refundEvent({ paymentId: 'sqpay_unknown' }), deps);

  assert.equal(result.kind, 'REFUND');
  if (result.kind === 'REFUND') assert.equal(result.outcome.kind, 'NO_RECONCILED_REDEMPTION');
  const alerts = await deps.alerts.listOpen();
  assert.equal(alerts[0]?.kind, 'REFUND_NO_REDEMPTION');
});

test('a duplicate event id is a no-op (idempotent dispatch)', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  await processSquareEvent(paymentEvent({ eventId: 'evt_x' }), deps);
  const replay = await processSquareEvent(paymentEvent({ eventId: 'evt_x' }), deps);

  if (replay.kind === 'PAYMENT') assert.equal(replay.outcome.kind, 'DUPLICATE');
  assert.equal(await ledger.getBalance('cust_1'), 3000); // deducted once
});
