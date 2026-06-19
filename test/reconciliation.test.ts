import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { MockPosAdapter } from '../src/adapters/mockPosAdapter';
import { buildRealisticDay } from '../src/adapters/mockScenario';
import { reconcileDay } from '../src/domain/reconciliation';
import { SaleEvent } from '../src/domain/types';

test('reconciling the realistic day: counts, unmatched list, and liability = positives', async () => {
  const repo = new InMemoryLedgerRepository();
  const ledger = new Ledger(repo);
  const adapter = new MockPosAdapter();

  const day = buildRealisticDay();
  for (const c of day.customers) {
    repo.addCustomer(c.customer);
    await ledger.issueCredit({ customerId: c.customer.id, amountCents: c.openingCreditCents });
  }
  adapter.seedOrders(day.orders);

  const sales = await adapter.fetchSalesSince('2000-01-01T00:00:00.000Z');
  for (const sale of sales) await ledger.applySaleEvent(sale);

  const report = await reconcileDay(sales, repo);

  // Two redemptions matched; one card-only ignored; the duplicate is deduped.
  assert.equal(report.appliedCount, 2);
  assert.equal(report.ignoredCount, 1);

  // Both unmatched sales are surfaced with reason, amount, and order ref.
  assert.deepEqual(
    report.unmatched.map((u) => `${u.reason}:${u.amountCents}:${u.orderRef}`).sort(),
    ['customer-not-found:1200:ord_1005', 'no-customer-on-sale:1000:ord_1004'],
  );

  // No over-redemptions in this day.
  assert.equal(report.negativeBalances.length, 0);

  // Liability is the sum of the positive balances: Marcus 3000 + Priya 1500.
  assert.equal(report.totals.outstandingLiabilityCents, 4500);
  assert.equal(report.totals.issuedCents, 8000); // 5000 + 3000
  assert.equal(report.totals.redeemedCents, 3500); // 2000 + 1500
});

test('an over-redemption shows as a negative balance and is excluded from liability', async () => {
  const repo = new InMemoryLedgerRepository();
  const ledger = new Ledger(repo);

  repo.addCustomer({ id: 'cust_alice', displayName: 'Alice', posCustomerRef: 'sq_alice' });
  repo.addCustomer({ id: 'cust_bob', displayName: 'Bob', posCustomerRef: 'sq_bob' });
  await ledger.issueCredit({ customerId: 'cust_alice', amountCents: 5000 });
  await ledger.issueCredit({ customerId: 'cust_bob', amountCents: 1000 });

  const ts = '2026-06-18T10:00:00.000-04:00';
  const events: SaleEvent[] = [
    // Alice redeems within balance.
    { eventId: 'e_alice', orderRef: 'o1', customerRef: 'sq_alice', occurredAt: ts,
      tenders: [{ type: 'STORE_CREDIT', amountCents: 2000 }] },
    // Bob over-redeems (Square-first records it; reconciliation must flag the negative).
    { eventId: 'e_bob', orderRef: 'o2', customerRef: 'sq_bob', occurredAt: ts,
      tenders: [{ type: 'STORE_CREDIT', amountCents: 2500 }] },
  ];
  for (const e of events) await ledger.applySaleEvent(e);

  const report = await reconcileDay(events, repo);

  assert.equal(report.appliedCount, 2);
  assert.deepEqual(report.negativeBalances, [
    { customerId: 'cust_bob', displayName: 'Bob', balanceCents: -1500 },
  ]);

  // Liability counts only Alice's positive 3000; Bob's negative is surfaced, not netted in.
  assert.equal(report.totals.outstandingLiabilityCents, 3000);
  assert.equal(report.totals.issuedCents, 6000);
  assert.equal(report.totals.redeemedCents, 4500);
});

test('reconcile is idempotent on event id: a duplicate is counted once', async () => {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_x', displayName: 'X', posCustomerRef: 'sq_x' });

  const ts = '2026-06-18T10:00:00.000-04:00';
  const dup: SaleEvent = {
    eventId: 'evt_same', orderRef: 'o', customerRef: 'sq_x', occurredAt: ts,
    tenders: [{ type: 'STORE_CREDIT', amountCents: 500 }],
  };

  const report = await reconcileDay([dup, dup], repo);
  assert.equal(report.appliedCount, 1); // not 2
});
