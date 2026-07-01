import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { InMemoryRedemptionRepository } from '../src/adapters/inMemoryRedemptionRepository';
import {
  InMemoryPendingRedemptionStore,
  InMemoryWebhookEventStore,
} from '../src/adapters/square/pendingRedemptions';
import { InMemoryAlertStore } from '../src/adapters/square/alerts';
import { processRedemptionEvent } from '../src/adapters/square/redemptionWebhook';

const LOC = 'L_SANDBOX';
const T = '2026-06-19T15:06:00.000Z'; // payment time; pendings within the fast-path window

function setup() {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_1', displayName: 'Marcus' });
  const ledger = new Ledger(repo);
  const deps = {
    redemptions: new InMemoryRedemptionRepository(),
    events: new InMemoryWebhookEventStore(),
    ledger,
    pendings: new InMemoryPendingRedemptionStore(),
    alerts: new InMemoryAlertStore(),
  };
  return { ledger, deps };
}

function paymentEvent(opts: { eventId?: string; status?: string; amount?: number; paymentId?: string }) {
  const payment: Record<string, unknown> = {
    id: opts.paymentId ?? 'sqpay_1',
    status: opts.status ?? 'COMPLETED',
    location_id: LOC,
    amount_money: { amount: opts.amount ?? 2000, currency: 'USD' },
    created_at: T,
    updated_at: T,
    source_type: 'EXTERNAL',
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

test('primary path: a COMPLETED OTHER payment creates one awaiting_attribution row, no ledger change', async () => {
  const { ledger, deps } = setup();
  const res = await processRedemptionEvent(paymentEvent({}), deps);

  assert.equal(res.kind, 'AWAITING_ATTRIBUTION');
  const open = await deps.redemptions.listAwaitingAttribution();
  assert.equal(open.length, 1);
  assert.equal(open[0]?.customerId, null);
  assert.equal(open[0]?.amountCents, 2000);
  assert.equal(open[0]?.squarePaymentId, 'sqpay_1');
  assert.equal(await ledger.getBalance('cust_1'), 0);
});

test('idempotency: re-delivering the same event, and the same payment under a new event id, create no second row', async () => {
  const { deps } = setup();
  await processRedemptionEvent(paymentEvent({ eventId: 'evt_a' }), deps);

  const sameEvent = await processRedemptionEvent(paymentEvent({ eventId: 'evt_a' }), deps);
  assert.equal(sameEvent.kind, 'DUPLICATE_EVENT');

  const samePayment = await processRedemptionEvent(paymentEvent({ eventId: 'evt_b' }), deps);
  assert.equal(samePayment.kind, 'ALREADY_RECORDED');

  assert.equal((await deps.redemptions.listAwaitingAttribution()).length, 1);
});

test('a non-COMPLETED payment is ignored and creates no row', async () => {
  const { deps } = setup();
  const res = await processRedemptionEvent(paymentEvent({ status: 'APPROVED' }), deps);
  assert.equal(res.kind, 'IGNORED');
  assert.equal((await deps.redemptions.listAwaitingAttribution()).length, 0);
});

test('fast path: a single clean legacy pending auto-attributes and draws the ledger', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  const res = await processRedemptionEvent(paymentEvent({}), deps);

  assert.equal(res.kind, 'AUTO_ATTRIBUTED');
  assert.equal(await ledger.getBalance('cust_1'), 3000);
  assert.equal((await deps.redemptions.listAwaitingAttribution()).length, 0);
  assert.equal((await deps.pendings.listOpen()).length, 0); // pending marked reconciled
});

test('ambiguity: two same-amount pendings do NOT auto-attribute — the row waits for a human', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });

  const res = await processRedemptionEvent(paymentEvent({}), deps);

  assert.equal(res.kind, 'AWAITING_ATTRIBUTION');
  assert.equal(await ledger.getBalance('cust_1'), 5000); // no guess, nothing drawn
  assert.equal((await deps.redemptions.listAwaitingAttribution()).length, 1);
});

test('refund: reverses the linked redemption and flips the row to reversed', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  const attributed = await processRedemptionEvent(paymentEvent({}), deps); // auto-attribute → 3000
  assert.equal(attributed.kind, 'AUTO_ATTRIBUTED');
  assert.equal(await ledger.getBalance('cust_1'), 3000);

  const res = await processRedemptionEvent(refundEvent({}), deps);

  assert.equal(res.kind, 'REFUND_REVERSED');
  assert.equal(await ledger.getBalance('cust_1'), 5000); // credit returned
  const row = res.kind === 'REFUND_REVERSED' ? await deps.redemptions.getById(res.redemptionId) : null;
  assert.equal(row?.status, 'reversed');
});

test('a non-COMPLETED refund is ignored and returns no credit (failed-refund edge)', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await deps.pendings.create({ customerId: 'cust_1', amountCents: 2000, locationId: LOC, createdAt: T });
  await processRedemptionEvent(paymentEvent({}), deps); // auto-attribute → 3000
  assert.equal(await ledger.getBalance('cust_1'), 3000);

  // A refund that goes PENDING (and may later FAIL) must not return credit.
  const res = await processRedemptionEvent(refundEvent({ status: 'PENDING' }), deps);
  assert.equal(res.kind, 'IGNORED');
  assert.equal(await ledger.getBalance('cust_1'), 3000);
});

test('refund for a payment with no redemption surfaces REFUND_NO_REDEMPTION', async () => {
  const { deps } = setup();
  const res = await processRedemptionEvent(refundEvent({ paymentId: 'sqpay_unknown' }), deps);
  assert.equal(res.kind, 'REFUND_NO_REDEMPTION');
  const alerts = await deps.alerts.listOpen();
  assert.equal(alerts[0]?.kind, 'REFUND_NO_REDEMPTION');
});
