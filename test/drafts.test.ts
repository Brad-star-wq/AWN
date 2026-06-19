import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Drafts } from '../src/domain/drafts';
import { InMemoryDraftRepository } from '../src/adapters/inMemoryDraftRepository';
import { MockPosAdapter } from '../src/adapters/mockPosAdapter';

async function setup() {
  const repo = new InMemoryDraftRepository();
  const drafts = new Drafts(repo);
  const stub = await repo.create({ sourceCustomerId: 'cust_1', itemType: 'SHOE' });
  return { repo, drafts, stub };
}

test('a draft completes DRAFT → READY → PUSHED, with attributes filled and catalog ref stored', async () => {
  const { drafts, stub } = await setup();
  const pos = new MockPosAdapter();
  assert.equal(stub.status, 'DRAFT');

  // Edit: attributes merge (not replace), price set.
  await drafts.edit(stub.id, { attributes: { brand: 'Nike' } });
  const edited = await drafts.edit(stub.id, { attributes: { size: '10' }, priceCents: 6500 });
  assert.deepEqual(edited.attributes, { brand: 'Nike', size: '10' });
  assert.equal(edited.priceCents, 6500);

  // Mark ready.
  const ready = await drafts.markReady(stub.id);
  assert.equal(ready.status, 'READY');

  // Push to POS: adapter called, status PUSHED, posCatalogRef stored.
  const pushed = await drafts.pushToPos(stub.id, pos);
  assert.equal(pushed.status, 'PUSHED');
  assert.ok(pushed.posCatalogRef);
  assert.equal(pushed.posCatalogRef, pos.catalogItems()[0]?.posCatalogRef);
  assert.equal(pos.catalogItems().length, 1);
});

test('pushing a draft that is not READY is rejected', async () => {
  const { drafts, stub } = await setup();
  const pos = new MockPosAdapter();
  await assert.rejects(drafts.pushToPos(stub.id, pos), /must be READY/);
  assert.equal(pos.catalogItems().length, 0);
});

test('editing or re-readying a pushed draft is rejected', async () => {
  const { drafts, stub } = await setup();
  const pos = new MockPosAdapter();
  await drafts.markReady(stub.id);
  await drafts.pushToPos(stub.id, pos);

  await assert.rejects(drafts.edit(stub.id, { priceCents: 100 }), /pushed/);
  await assert.rejects(drafts.markReady(stub.id), /pushed/);
});

test('toggling online and listing by status', async () => {
  const { drafts, stub } = await setup();
  const online = await drafts.setOnline(stub.id, true);
  assert.equal(online.online, true);

  await drafts.markReady(stub.id);
  const readyList = await drafts.list({ status: 'READY' });
  assert.equal(readyList.length, 1);
  const draftList = await drafts.list({ status: 'DRAFT' });
  assert.equal(draftList.length, 0);
});
