import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, OverdrawError, storeCreditCents } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { SaleEvent } from '../src/domain/types';

function setup() {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_marcus', displayName: 'Marcus T.', posCustomerRef: 'sq_marcus' });
  return { repo, ledger: new Ledger(repo) };
}

test('balance is the sum of entries; partial redemption is first-class', async () => {
  const { ledger } = setup();

  await ledger.issueCredit({ customerId: 'cust_marcus', amountCents: 6000, sourceRef: 'intake_1' });
  assert.equal(await ledger.getBalance('cust_marcus'), 6000);

  await ledger.redeemCredit({ customerId: 'cust_marcus', amountCents: 2000, sourceRef: 'order_1' });
  assert.equal(await ledger.getBalance('cust_marcus'), 4000); // partial leaves the rest
});

test('applying a sale with a store-credit tender deducts the balance', async () => {
  const { ledger } = setup();
  await ledger.issueCredit({ customerId: 'cust_marcus', amountCents: 4000 });

  const sale: SaleEvent = {
    eventId: 'evt_1',
    orderRef: 'order_42',
    customerRef: 'sq_marcus',
    occurredAt: new Date().toISOString(),
    tenders: [
      { type: 'OTHER', amountCents: 4000, note: 'Store Credit' }, // Square "Other + note" shape
      { type: 'CARD', amountCents: 1500 },
    ],
  };

  const result = await ledger.applySaleEvent(sale);
  assert.equal(result.status, 'APPLIED');
  assert.equal(await ledger.getBalance('cust_marcus'), 0);
});

test('replaying the same sale event never double-deducts (idempotency)', async () => {
  const { ledger, repo } = setup();
  await ledger.issueCredit({ customerId: 'cust_marcus', amountCents: 4000 });

  const sale: SaleEvent = {
    eventId: 'evt_dup',
    orderRef: 'order_99',
    customerRef: 'sq_marcus',
    occurredAt: new Date().toISOString(),
    tenders: [{ type: 'STORE_CREDIT', amountCents: 4000 }],
  };

  const first = await ledger.applySaleEvent(sale);
  const second = await ledger.applySaleEvent(sale); // duplicate webhook / catch-up pull

  assert.equal(first.status, 'APPLIED');
  assert.equal(second.status, 'IGNORED');
  assert.equal(await ledger.getBalance('cust_marcus'), 0);
  // exactly one ISSUE + one REDEEM recorded, not two redeems
  assert.equal(repo.allEntries().filter((e) => e.kind === 'REDEEM').length, 1);
});

test('enforced redemption rejects an overdraw; un-enforced records and flags later', async () => {
  const { ledger } = setup();
  await ledger.issueCredit({ customerId: 'cust_marcus', amountCents: 3000 });

  // app-first flow: the app caps the amount, so an overdraw is rejected
  await assert.rejects(
    ledger.redeemCredit({ customerId: 'cust_marcus', amountCents: 5000, enforceBalance: true }),
    OverdrawError,
  );
  assert.equal(await ledger.getBalance('cust_marcus'), 3000); // untouched

  // Square-first flow: record it anyway; reconciliation will surface the negative
  await ledger.redeemCredit({ customerId: 'cust_marcus', amountCents: 5000, enforceBalance: false });
  assert.equal(await ledger.getBalance('cust_marcus'), -2000);
});

test('a sale with no customer or an unknown customer is surfaced, not dropped', async () => {
  const { ledger } = setup();

  const noCustomer: SaleEvent = {
    eventId: 'evt_a', orderRef: 'o_a', occurredAt: new Date().toISOString(),
    tenders: [{ type: 'STORE_CREDIT', amountCents: 1000 }],
  };
  const r1 = await ledger.applySaleEvent(noCustomer);
  assert.equal(r1.status, 'UNMATCHED');
  if (r1.status === 'UNMATCHED') assert.equal(r1.reason, 'no-customer-on-sale');

  const unknownCustomer: SaleEvent = {
    eventId: 'evt_b', orderRef: 'o_b', customerRef: 'sq_ghost', occurredAt: new Date().toISOString(),
    tenders: [{ type: 'STORE_CREDIT', amountCents: 1000 }],
  };
  const r2 = await ledger.applySaleEvent(unknownCustomer);
  assert.equal(r2.status, 'UNMATCHED');
  if (r2.status === 'UNMATCHED') assert.equal(r2.reason, 'customer-not-found');
});

test('adjustCredit posts a signed ADJUST row; rejects zero/non-integer', async () => {
  const { ledger } = setup();
  await ledger.issueCredit({ customerId: 'cust_marcus', amountCents: 5000 });

  const up = await ledger.adjustCredit({ customerId: 'cust_marcus', amountCents: 500, note: 'goodwill' });
  assert.equal(up.kind, 'ADJUST');
  assert.equal(await ledger.getBalance('cust_marcus'), 5500);

  await ledger.adjustCredit({ customerId: 'cust_marcus', amountCents: -1500, note: 'correction' });
  assert.equal(await ledger.getBalance('cust_marcus'), 4000);

  await assert.rejects(ledger.adjustCredit({ customerId: 'cust_marcus', amountCents: 0 }), /non-zero/);
  await assert.rejects(ledger.adjustCredit({ customerId: 'cust_marcus', amountCents: 10.5 }), /integer/);
});

test('a sale with no store-credit tender is ignored', async () => {
  const { ledger } = setup();
  const cardOnly: SaleEvent = {
    eventId: 'evt_card', orderRef: 'o_c', customerRef: 'sq_marcus', occurredAt: new Date().toISOString(),
    tenders: [{ type: 'CARD', amountCents: 5500 }],
  };
  const r = await ledger.applySaleEvent(cardOnly);
  assert.equal(r.status, 'IGNORED');
});

test('store-credit recognition handles both Square shapes and sums them', () => {
  assert.equal(storeCreditCents([{ type: 'STORE_CREDIT', amountCents: 1000 }]), 1000);
  assert.equal(storeCreditCents([{ type: 'OTHER', amountCents: 1000, note: 'store credit' }]), 1000);
  assert.equal(storeCreditCents([{ type: 'OTHER', amountCents: 1000, note: 'Check #204' }]), 0);
  assert.equal(
    storeCreditCents([
      { type: 'OTHER', amountCents: 1000, note: 'Store Credit' },
      { type: 'STORE_CREDIT', amountCents: 500 },
      { type: 'CARD', amountCents: 9999 },
    ]),
    1500,
  );
});
