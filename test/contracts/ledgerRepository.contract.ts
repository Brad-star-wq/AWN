import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepoSetFactory } from './support';

/**
 * Storage contract for any `LedgerRepository`. These are the in-memory ledger
 * scenarios lifted to run against any implementation: balance-as-sum, partial
 * redemption, idempotent append, totals, and the customer lookups the ledger
 * shares with the customer store.
 *
 * A customer is created through the customer repo first (the Postgres ledger
 * enforces the FK to `customers`), exactly as the real wiring does.
 */
export function ledgerRepositoryContract(label: string, factory: RepoSetFactory): void {
  const name = (s: string) => `[${label}] LedgerRepository: ${s}`;

  test(name('balance is the sum of entries; partial redemption is first-class'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const c = await customers.create({ displayName: 'Marcus T.', posCustomerRef: 'sq_marcus' });
      assert.equal(await ledger.getBalance(c.id), 0);

      await ledger.appendEntry({ customerId: c.id, kind: 'ISSUE', deltaCents: 6000, source: 'INTAKE' });
      assert.equal(await ledger.getBalance(c.id), 6000);

      await ledger.appendEntry({ customerId: c.id, kind: 'REDEEM', deltaCents: -2000, source: 'SALE' });
      assert.equal(await ledger.getBalance(c.id), 4000); // partial leaves the rest
    } finally {
      await cleanup();
    }
  });

  test(name('appendEntry is idempotent on idempotencyKey (returns the existing row)'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const c = await customers.create({ displayName: 'M', posCustomerRef: 'sq_m' });

      const first = await ledger.appendEntry({
        customerId: c.id, kind: 'REDEEM', deltaCents: -1500, source: 'SALE', idempotencyKey: 'sale:evt_1',
      });
      const second = await ledger.appendEntry({
        customerId: c.id, kind: 'REDEEM', deltaCents: -1500, source: 'SALE', idempotencyKey: 'sale:evt_1',
      });

      assert.equal(second.id, first.id); // same row, not a second post
      assert.equal(await ledger.getBalance(c.id), -1500); // deducted exactly once
    } finally {
      await cleanup();
    }
  });

  test(name('hasIdempotencyKey reflects whether a keyed entry exists'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const c = await customers.create({ displayName: 'M' });
      assert.equal(await ledger.hasIdempotencyKey('sale:evt_x'), false);
      await ledger.appendEntry({
        customerId: c.id, kind: 'ISSUE', deltaCents: 1000, source: 'INTAKE', idempotencyKey: 'sale:evt_x',
      });
      assert.equal(await ledger.hasIdempotencyKey('sale:evt_x'), true);
    } finally {
      await cleanup();
    }
  });

  test(name('entries without an idempotency key each post (multiple nulls allowed)'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const c = await customers.create({ displayName: 'M' });
      await ledger.appendEntry({ customerId: c.id, kind: 'ISSUE', deltaCents: 1000, source: 'INTAKE' });
      await ledger.appendEntry({ customerId: c.id, kind: 'ISSUE', deltaCents: 1000, source: 'INTAKE' });
      assert.equal(await ledger.getBalance(c.id), 2000);
    } finally {
      await cleanup();
    }
  });

  test(name('ledgerTotals sums positives as issued and abs(negatives) as redeemed'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const a = await customers.create({ displayName: 'A' });
      const b = await customers.create({ displayName: 'B' });
      await ledger.appendEntry({ customerId: a.id, kind: 'ISSUE', deltaCents: 5000, source: 'INTAKE' });
      await ledger.appendEntry({ customerId: b.id, kind: 'ISSUE', deltaCents: 3000, source: 'INTAKE' });
      await ledger.appendEntry({ customerId: a.id, kind: 'REDEEM', deltaCents: -2000, source: 'SALE' });

      const totals = await ledger.ledgerTotals();
      assert.deepEqual(totals, { issuedCents: 8000, redeemedCents: 2000 });
    } finally {
      await cleanup();
    }
  });

  test(name('listEntries returns newest-first, filtered by customer / since / limit'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const a = await customers.create({ displayName: 'A' });
      const b = await customers.create({ displayName: 'B' });

      const e1 = await ledger.appendEntry({ customerId: a.id, kind: 'ISSUE', deltaCents: 1000, source: 'INTAKE' });
      const e2 = await ledger.appendEntry({ customerId: a.id, kind: 'REDEEM', deltaCents: -400, source: 'SALE' });
      const e3 = await ledger.appendEntry({ customerId: b.id, kind: 'ISSUE', deltaCents: 2000, source: 'INTAKE' });

      // All entries, newest first.
      const all = await ledger.listEntries();
      assert.deepEqual(all.map((e) => e.id), [e3.id, e2.id, e1.id]);

      // Scoped to one customer.
      const aOnly = await ledger.listEntries({ customerId: a.id });
      assert.deepEqual(aOnly.map((e) => e.id), [e2.id, e1.id]);

      // Limit takes the newest N.
      const newest = await ledger.listEntries({ limit: 1 });
      assert.deepEqual(newest.map((e) => e.id), [e3.id]);

      // since filters by the time window (coarse bounds avoid sub-ms flakiness).
      assert.equal((await ledger.listEntries({ sinceIso: '2999-01-01T00:00:00.000Z' })).length, 0);
      assert.equal((await ledger.listEntries({ sinceIso: '2000-01-01T00:00:00.000Z' })).length, 3);
    } finally {
      await cleanup();
    }
  });

  test(name('resolves customers from the shared store (getCustomer / byPosRef / list)'), async () => {
    const { ledger, customers, cleanup } = await factory();
    try {
      const c = await customers.create({ displayName: 'Marcus', posCustomerRef: 'sq_marcus' });
      assert.deepEqual(await ledger.getCustomer(c.id), c);
      assert.deepEqual(await ledger.findCustomerByPosRef('sq_marcus'), c);
      assert.equal(await ledger.findCustomerByPosRef('sq_ghost'), null);
      const all = await ledger.listCustomers();
      assert.equal(all.some((x) => x.id === c.id), true);
    } finally {
      await cleanup();
    }
  });
}
