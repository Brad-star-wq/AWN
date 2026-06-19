import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { createIntake, IntakeDeps } from '../src/domain/intake';
import { InMemoryCustomerRepository } from '../src/adapters/inMemoryCustomerRepository';
import { InMemoryDraftRepository } from '../src/adapters/inMemoryDraftRepository';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';

function setup(): IntakeDeps & { customers: InMemoryCustomerRepository; ledgerRepo: InMemoryLedgerRepository } {
  const customers = new InMemoryCustomerRepository();
  const ledgerRepo = new InMemoryLedgerRepository(customers); // shared customer store
  return {
    customers,
    ledgerRepo,
    ledger: new Ledger(ledgerRepo),
    drafts: new InMemoryDraftRepository(),
  };
}

test('intake creates the customer, posts the credit, and drops draft stubs', async () => {
  const deps = setup();

  const result = await createIntake(
    {
      customer: { displayName: 'Marcus T.', phone: '555-0100', posCustomerRef: 'sq_marcus' },
      creditCents: 4500,
      items: [
        { itemType: 'SHOE', attributes: { brand: 'Nike' } },
        { itemType: 'CARD' },
      ],
    },
    deps,
  );

  // Customer was created and credit posted to that customer's balance.
  assert.ok(result.customer.id);
  assert.equal(await deps.ledger.getBalance(result.customer.id), 4500);
  assert.equal(result.creditEntry.kind, 'ISSUE');

  // Two draft stubs, born DRAFT, linked to the customer, offline.
  assert.equal(result.drafts.length, 2);
  for (const d of result.drafts) {
    assert.equal(d.status, 'DRAFT');
    assert.equal(d.sourceCustomerId, result.customer.id);
    assert.equal(d.online, false);
  }
  assert.equal(result.drafts[0]?.itemType, 'SHOE');
  assert.deepEqual(result.drafts[0]?.attributes, { brand: 'Nike' });

  // The customer is visible to the shared store (so reconciliation will see it).
  const seen = await deps.customers.listCustomers();
  assert.equal(seen.length, 1);
});

test('intake finds an existing customer by phone instead of creating a duplicate', async () => {
  const deps = setup();

  const first = await createIntake(
    { customer: { displayName: 'Priya N.', phone: '555-0200' }, creditCents: 1000, items: [] },
    deps,
  );
  const second = await createIntake(
    { customer: { displayName: 'Priya (typo)', phone: '555-0200' }, creditCents: 1500, items: [] },
    deps,
  );

  assert.equal(second.customer.id, first.customer.id); // same customer
  assert.equal((await deps.customers.listCustomers()).length, 1);
  assert.equal(await deps.ledger.getBalance(first.customer.id), 2500); // credit accumulates
});

test('intake for an existing customer id reuses it', async () => {
  const deps = setup();
  const existing = await deps.customers.create({ displayName: 'Dana', posCustomerRef: 'sq_dana' });

  const result = await createIntake(
    { customer: { id: existing.id }, creditCents: 800, items: [{ itemType: 'OTHER' }] },
    deps,
  );

  assert.equal(result.customer.id, existing.id);
  assert.equal(await deps.ledger.getBalance(existing.id), 800);
});

test('intake rejects a non-positive credit at the boundary', async () => {
  const deps = setup();
  await assert.rejects(
    createIntake({ customer: { displayName: 'Z' }, creditCents: 0, items: [] }, deps),
    /positive/,
  );
});
