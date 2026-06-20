import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/domain/ledger';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { InMemoryPendingRedemptionStore } from '../src/adapters/square/pendingRedemptions';
import {
  createPendingRedemption,
  availableCreditCents,
  InsufficientAvailableCreditError,
} from '../src/adapters/square/createPendingRedemption';

const LOC = 'L_MAIN';
const T = '2026-06-19T15:00:00.000Z';

function setup() {
  const repo = new InMemoryLedgerRepository();
  repo.addCustomer({ id: 'cust_1', displayName: 'Marcus' });
  const ledger = new Ledger(repo);
  const pendings = new InMemoryPendingRedemptionStore();
  return { ledger, pendings, deps: { balances: ledger, pendings } };
}

test('a pending within available credit is created', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 6000 });
  const p = await createPendingRedemption(
    { customerId: 'cust_1', amountCents: 6000, locationId: LOC, createdAt: T },
    deps,
  );
  assert.equal(p.status, 'PENDING');
  assert.equal(p.amountCents, 6000);
});

test('two overlapping pendings cannot both pledge the same credit', async () => {
  // The exact hole the enforceBalance:false flag would open: $60 customer,
  // a first $60 pending consumes all available, the second must be rejected
  // even though the raw balance still reads $60 (nothing finalized yet).
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 6000 });

  await createPendingRedemption(
    { customerId: 'cust_1', amountCents: 6000, locationId: LOC, createdAt: T },
    deps,
  );
  assert.equal(await ledger.getBalance('cust_1'), 6000); // raw balance unchanged
  assert.equal(await availableCreditCents('cust_1', deps), 0); // but nothing available

  await assert.rejects(
    () =>
      createPendingRedemption(
        { customerId: 'cust_1', amountCents: 6000, locationId: LOC, createdAt: T },
        deps,
      ),
    InsufficientAvailableCreditError,
  );
});

test('available credit reflects open pendings, and frees up when one closes', async () => {
  const { ledger, pendings, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 10000 });

  const p1 = await createPendingRedemption(
    { customerId: 'cust_1', amountCents: 4000, locationId: LOC, createdAt: T },
    deps,
  );
  assert.equal(await availableCreditCents('cust_1', deps), 6000);

  // A second partial still fits within the remaining $60.
  await createPendingRedemption(
    { customerId: 'cust_1', amountCents: 6000, locationId: LOC, createdAt: T },
    deps,
  );
  assert.equal(await availableCreditCents('cust_1', deps), 0);

  // Expiring the first frees its pledge back to available.
  await pendings.markExpired(p1.id);
  assert.equal(await availableCreditCents('cust_1', deps), 4000);
});

test('over-pledge by a single cent is rejected', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await assert.rejects(
    () =>
      createPendingRedemption(
        { customerId: 'cust_1', amountCents: 5001, locationId: LOC, createdAt: T },
        deps,
      ),
    InsufficientAvailableCreditError,
  );
});

test('non-integer and non-positive amounts are rejected at the boundary', async () => {
  const { ledger, deps } = setup();
  await ledger.issueCredit({ customerId: 'cust_1', amountCents: 5000 });
  await assert.rejects(() =>
    createPendingRedemption(
      { customerId: 'cust_1', amountCents: 10.5, locationId: LOC, createdAt: T },
      deps,
    ),
  );
  await assert.rejects(() =>
    createPendingRedemption(
      { customerId: 'cust_1', amountCents: 0, locationId: LOC, createdAt: T },
      deps,
    ),
  );
});
