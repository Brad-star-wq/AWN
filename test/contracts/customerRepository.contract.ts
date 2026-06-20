import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepoSetFactory } from './support';

/**
 * Storage contract for any `CustomerRepository`. Extracted from the in-memory
 * scenarios so the Postgres impl is held to the exact same behavior.
 */
export function customerRepositoryContract(label: string, factory: RepoSetFactory): void {
  const name = (s: string) => `[${label}] CustomerRepository: ${s}`;

  test(name('create returns a customer with an id and the given fields'), async () => {
    const { customers, cleanup } = await factory();
    try {
      const c = await customers.create({
        displayName: 'Marcus T.',
        phone: '555-0100',
        posCustomerRef: 'sq_marcus',
      });
      assert.ok(c.id);
      assert.equal(c.displayName, 'Marcus T.');
      assert.equal(c.phone, '555-0100');
      assert.equal(c.posCustomerRef, 'sq_marcus');
    } finally {
      await cleanup();
    }
  });

  test(name('getCustomer round-trips by id; unknown id is null'), async () => {
    const { customers, cleanup } = await factory();
    try {
      const created = await customers.create({ displayName: 'Priya N.' });
      const fetched = await customers.getCustomer(created.id);
      assert.deepEqual(fetched, created);
      assert.equal(await customers.getCustomer('00000000-0000-0000-0000-000000000000'), null);
    } finally {
      await cleanup();
    }
  });

  test(name('findByPosRef resolves the join key; unknown ref is null'), async () => {
    const { customers, cleanup } = await factory();
    try {
      const created = await customers.create({ displayName: 'Dana', posCustomerRef: 'sq_dana' });
      assert.deepEqual(await customers.findByPosRef('sq_dana'), created);
      assert.equal(await customers.findByPosRef('sq_nobody'), null);
    } finally {
      await cleanup();
    }
  });

  test(name('findByPhone resolves the counter lookup; unknown phone is null'), async () => {
    const { customers, cleanup } = await factory();
    try {
      const created = await customers.create({ displayName: 'Priya', phone: '555-0200' });
      assert.deepEqual(await customers.findByPhone('555-0200'), created);
      assert.equal(await customers.findByPhone('555-9999'), null);
    } finally {
      await cleanup();
    }
  });

  test(name('listCustomers returns every created customer'), async () => {
    const { customers, cleanup } = await factory();
    try {
      assert.equal((await customers.listCustomers()).length, 0);
      await customers.create({ displayName: 'A' });
      await customers.create({ displayName: 'B' });
      const all = await customers.listCustomers();
      assert.equal(all.length, 2);
      assert.deepEqual(all.map((c) => c.displayName).sort(), ['A', 'B']);
    } finally {
      await cleanup();
    }
  });

  test(name('optional fields absent come back undefined, not null'), async () => {
    const { customers, cleanup } = await factory();
    try {
      const c = await customers.create({ displayName: 'Bare' });
      assert.equal(c.phone, undefined);
      assert.equal(c.posCustomerRef, undefined);
      assert.equal('phone' in c, false);
      assert.equal('posCustomerRef' in c, false);
    } finally {
      await cleanup();
    }
  });
}
