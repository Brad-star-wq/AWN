import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepoSetFactory } from './support';

/**
 * Storage contract for any `DraftRepository`. The attribute deep-merge lives in
 * the `Drafts` domain service; the repo's `update` is a plain field patch, so
 * the contract checks patch-replaces-field semantics and the status machine's
 * persistence (`DRAFT → READY → PUSHED` with a stored catalog ref).
 */
export function draftRepositoryContract(label: string, factory: RepoSetFactory): void {
  const name = (s: string) => `[${label}] DraftRepository: ${s}`;

  test(name('create defaults to DRAFT, offline, empty attributes'), async () => {
    const { drafts, cleanup } = await factory();
    try {
      const d = await drafts.create({ itemType: 'SHOE' });
      assert.ok(d.id);
      assert.equal(d.status, 'DRAFT');
      assert.equal(d.online, false);
      assert.deepEqual(d.attributes, {});
      assert.equal(d.itemType, 'SHOE');
    } finally {
      await cleanup();
    }
  });

  test(name('create stores source customer, attributes, and price'), async () => {
    const { drafts, customers, cleanup } = await factory();
    try {
      const owner = await customers.create({ displayName: 'Seller' });
      const d = await drafts.create({
        sourceCustomerId: owner.id,
        itemType: 'CARD',
        attributes: { brand: 'Topps' },
        priceCents: 2500,
      });
      assert.equal(d.sourceCustomerId, owner.id);
      assert.deepEqual(d.attributes, { brand: 'Topps' });
      assert.equal(d.priceCents, 2500);

      const fetched = await drafts.get(d.id);
      assert.deepEqual(fetched, d);
    } finally {
      await cleanup();
    }
  });

  test(name('get returns null for an unknown id'), async () => {
    const { drafts, cleanup } = await factory();
    try {
      assert.equal(await drafts.get('00000000-0000-0000-0000-000000000000'), null);
    } finally {
      await cleanup();
    }
  });

  test(name('update patches fields and drives DRAFT → READY → PUSHED'), async () => {
    const { drafts, cleanup } = await factory();
    try {
      const d = await drafts.create({ itemType: 'SHOE' });

      const priced = await drafts.update(d.id, { attributes: { size: '10' }, priceCents: 6500 });
      assert.deepEqual(priced.attributes, { size: '10' }); // patch replaces the field
      assert.equal(priced.priceCents, 6500);

      const ready = await drafts.update(d.id, { status: 'READY' });
      assert.equal(ready.status, 'READY');

      const pushed = await drafts.update(d.id, { status: 'PUSHED', posCatalogRef: 'cat_1' });
      assert.equal(pushed.status, 'PUSHED');
      assert.equal(pushed.posCatalogRef, 'cat_1');

      // Persisted, not just returned.
      assert.deepEqual(await drafts.get(d.id), pushed);
    } finally {
      await cleanup();
    }
  });

  test(name('update on an unknown id throws'), async () => {
    const { drafts, cleanup } = await factory();
    try {
      await assert.rejects(
        drafts.update('00000000-0000-0000-0000-000000000000', { status: 'READY' }),
        /not found/i,
      );
    } finally {
      await cleanup();
    }
  });

  test(name('list filters by status and by source customer'), async () => {
    const { drafts, customers, cleanup } = await factory();
    try {
      const seller = await customers.create({ displayName: 'Seller' });
      const other = await customers.create({ displayName: 'Other' });
      const a = await drafts.create({ itemType: 'SHOE', sourceCustomerId: seller.id });
      await drafts.create({ itemType: 'CARD', sourceCustomerId: other.id });
      await drafts.update(a.id, { status: 'READY' });

      assert.equal((await drafts.list()).length, 2);
      assert.equal((await drafts.list({ status: 'READY' })).length, 1);
      assert.equal((await drafts.list({ status: 'DRAFT' })).length, 1);
      const sellersDrafts = await drafts.list({ sourceCustomerId: seller.id });
      assert.equal(sellersDrafts.length, 1);
      assert.equal(sellersDrafts[0]?.id, a.id);
    } finally {
      await cleanup();
    }
  });
}
