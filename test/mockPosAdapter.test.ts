import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { MockPosAdapter } from '../src/adapters/mockPosAdapter';
import { buildRealisticDay } from '../src/adapters/mockScenario';
import { DraftProduct } from '../src/domain/types';

/** Wire up a repo + ledger + mock adapter seeded with the scripted day. */
async function setupDay() {
  const repo = new InMemoryLedgerRepository();
  const ledger = new Ledger(repo);
  const adapter = new MockPosAdapter();

  const day = buildRealisticDay();
  for (const c of day.customers) {
    repo.addCustomer(c.customer);
    await ledger.issueCredit({
      customerId: c.customer.id,
      amountCents: c.openingCreditCents,
      sourceRef: 'opening',
    });
  }
  adapter.seedOrders(day.orders);

  return { repo, ledger, adapter };
}

/** Compact, comparable label for an apply outcome. */
function outcomeTag(o: Awaited<ReturnType<Ledger['applySaleEvent']>>): string {
  switch (o.status) {
    case 'APPLIED':
      return `APPLIED:${o.customerId}:${o.creditCents}`;
    case 'IGNORED':
      return `IGNORED:${o.reason}`;
    case 'UNMATCHED':
      return `UNMATCHED:${o.reason}:${o.creditCents}`;
  }
}

test('mock adapter pulls the day and the engine applies each sale end-to-end', async () => {
  const { repo, ledger, adapter } = await setupDay();

  // The catch-up pull returns every order, including the duplicate.
  const sales = await adapter.fetchSalesSince('2000-01-01T00:00:00.000Z');
  assert.equal(sales.length, 6);

  const outcomes: string[] = [];
  for (const sale of sales) {
    outcomes.push(outcomeTag(await ledger.applySaleEvent(sale)));
  }

  // The exact, ordered set of outcomes for the scripted day.
  assert.deepEqual(outcomes, [
    'APPLIED:cust_marcus:2000',
    'APPLIED:cust_priya:1500',
    'IGNORED:no-store-credit',
    'UNMATCHED:no-customer-on-sale:1000',
    'UNMATCHED:customer-not-found:1200',
    'IGNORED:already-applied', // the duplicate
  ]);

  // Final balances: openings minus the single redemption each.
  assert.equal(await ledger.getBalance('cust_marcus'), 3000); // 5000 - 2000
  assert.equal(await ledger.getBalance('cust_priya'), 1500); // 3000 - 1500

  // The duplicate event deducted exactly once: two REDEEM rows total.
  assert.equal(repo.allEntries().filter((e) => e.kind === 'REDEEM').length, 2);
});

test('normalizeWebhook maps a raw POS payload into the engine SaleEvent shape', () => {
  const adapter = new MockPosAdapter();

  const event = adapter.normalizeWebhook({
    id: 'evt_x',
    order_id: 'ord_x',
    customer_id: 'sq_marcus',
    created_at: '2026-06-18T10:00:00.000-04:00',
    tenders: [
      { method: 'other', amount_cents: 800, note: 'Store Credit' },
      { method: 'card', amount_cents: 200 },
    ],
  });

  assert.deepEqual(event, {
    eventId: 'evt_x',
    orderRef: 'ord_x',
    customerRef: 'sq_marcus',
    occurredAt: '2026-06-18T10:00:00.000-04:00',
    tenders: [
      { type: 'OTHER', amountCents: 800, note: 'Store Credit' },
      { type: 'CARD', amountCents: 200 },
    ],
  });
});

test('normalizeWebhook returns null for a payload that is not an order', () => {
  const adapter = new MockPosAdapter();
  assert.equal(adapter.normalizeWebhook(null), null);
  assert.equal(adapter.normalizeWebhook({ foo: 'bar' }), null);
  assert.equal(adapter.normalizeWebhook({ id: 'x' }), null); // missing required fields
});

test('fetchSalesSince filters by timestamp', async () => {
  const { adapter } = await setupDay();

  // Everything happens on 2026-06-18; a cutoff the next day yields nothing.
  const none = await adapter.fetchSalesSince('2026-06-19T00:00:00.000-04:00');
  assert.equal(none.length, 0);

  // A mid-afternoon cutoff keeps only the later orders (no-customer + unknown).
  const afternoon = await adapter.fetchSalesSince('2026-06-18T13:00:00.000-04:00');
  assert.deepEqual(
    afternoon.map((s) => s.eventId),
    ['evt_no_customer', 'evt_unknown_customer'],
  );
});

test('pushProduct stores the draft in the mock catalog and returns an external id', async () => {
  const adapter = new MockPosAdapter();
  const draft: DraftProduct = {
    id: 'draft_1',
    itemType: 'SHOE',
    attributes: { brand: 'Nike' },
    priceCents: 6500,
    status: 'READY',
    online: false,
  };

  const { externalId } = await adapter.pushProduct(draft);
  assert.match(externalId, /^mock_cat_\d+$/);

  const items = adapter.catalogItems();
  assert.equal(items.length, 1);
  assert.equal(items[0]?.posCatalogRef, externalId);
});
