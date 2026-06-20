import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftProduct } from '../src/domain/types';
import {
  buildCategoryUpsertBody,
  buildItemUpsertBody,
  mapDraftToItem,
  SquareCatalogAdapter,
} from '../src/adapters/square/squareCatalog';
import { SquareClient, SquareApiError } from '../src/adapters/square/squareClient';

// ---- body builders (pure) ----

test('category create: temp id, full data, no version', () => {
  const body = buildCategoryUpsertBody({ name: 'Shoes' }, 'idem-1');
  assert.equal(body.idempotency_key, 'idem-1');
  assert.deepEqual(body.object, { type: 'CATEGORY', id: '#category', category_data: { name: 'Shoes' } });
});

test('category update: real id + version + full object (no sparse update)', () => {
  const body = buildCategoryUpsertBody({ name: 'Sneakers', squareId: 'CAT123', version: 7 }, 'idem-2');
  assert.deepEqual(body.object, {
    type: 'CATEGORY',
    id: 'CAT123',
    version: 7,
    category_data: { name: 'Sneakers' }, // full data is always sent
  });
});

test('item push: priced variation, no SKU anywhere', () => {
  const body = buildItemUpsertBody({ name: 'Jordan 1', priceCents: 12000 }, 'idem-3');
  const item = body.object.item_data;
  const variation = item.variations[0]!;
  assert.equal(item.name, 'Jordan 1');
  assert.equal(variation.item_variation_data.price_money.amount, 12000);
  assert.equal(variation.item_variation_data.pricing_type, 'FIXED_PRICING');
  // The whole serialized body must never contain a sku field.
  assert.ok(!JSON.stringify(body).toLowerCase().includes('sku'));
});

test('item push: links a category when given', () => {
  const body = buildItemUpsertBody({ name: 'X', priceCents: 100, categoryId: 'CAT123' }, 'k');
  assert.deepEqual(body.object.item_data.categories, [{ id: 'CAT123' }]);
});

test('mapDraftToItem requires a valid price', () => {
  const draft: DraftProduct = {
    id: 'd1',
    itemType: 'SHOE',
    attributes: { name: 'Nike' },
    status: 'READY',
    online: false,
  };
  assert.throws(() => mapDraftToItem(draft), /no valid priceCents/);
  assert.deepEqual(mapDraftToItem({ ...draft, priceCents: 5000 }), { name: 'Nike', priceCents: 5000 });
});

test('mapDraftToItem falls back to a name from the item type', () => {
  const draft: DraftProduct = {
    id: 'd2',
    itemType: 'CARD',
    attributes: {},
    priceCents: 300,
    status: 'READY',
    online: false,
  };
  assert.equal(mapDraftToItem(draft).name, 'CARD item');
});

// ---- client retry/backoff (injected fetch + sleep) ----

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** A fetch stub that returns a queued sequence of responses and records calls. */
function stubFetch(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const res = responses[i];
    i += 1;
    if (!res) throw new Error('stubFetch: no more responses queued');
    return res;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('client retries on 429 then succeeds, pinning the version header', async () => {
  const { fn, calls } = stubFetch([
    jsonResponse(429, { errors: [{ code: 'RATE_LIMITED' }] }, { 'Retry-After': '0' }),
    jsonResponse(200, { catalog_object: { id: 'CAT9', version: 1 } }),
  ]);
  const sleeps: number[] = [];
  const client = new SquareClient({
    accessToken: 'sandbox-token',
    fetchImpl: fn,
    sleep: async (ms) => void sleeps.push(ms),
  });

  const res = (await client.post('/v2/catalog/object', { object: {} })) as { catalog_object: { id: string } };
  assert.equal(res.catalog_object.id, 'CAT9');
  assert.equal(calls.length, 2); // one retry
  assert.equal(sleeps.length, 1);
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['Square-Version'], '2026-01-22');
  assert.equal(headers['Authorization'], 'Bearer sandbox-token');
});

test('client retries on 5xx and gives up after maxRetries', async () => {
  const { fn, calls } = stubFetch([
    jsonResponse(500, {}),
    jsonResponse(500, {}),
    jsonResponse(500, {}),
  ]);
  const client = new SquareClient({
    accessToken: 't',
    fetchImpl: fn,
    maxRetries: 2,
    sleep: async () => {},
  });
  await assert.rejects(() => client.post('/v2/catalog/object', {}), SquareApiError);
  assert.equal(calls.length, 3); // initial + 2 retries
});

test('client does NOT retry a 4xx (e.g. bad scope) and surfaces the error', async () => {
  const { fn, calls } = stubFetch([
    jsonResponse(403, { errors: [{ code: 'INSUFFICIENT_SCOPES' }] }),
  ]);
  const client = new SquareClient({ accessToken: 't', fetchImpl: fn, sleep: async () => {} });
  await assert.rejects(() => client.post('/v2/catalog/object', {}), (e: unknown) => {
    assert.ok(e instanceof SquareApiError);
    assert.equal(e.status, 403);
    return true;
  });
  assert.equal(calls.length, 1); // no retry on 4xx
});

test('adapter.upsertCategory returns the new id + version', async () => {
  const { fn } = stubFetch([jsonResponse(200, { catalog_object: { id: 'CATNEW', version: 3 } })]);
  const adapter = new SquareCatalogAdapter(new SquareClient({ accessToken: 't', fetchImpl: fn }));
  assert.deepEqual(await adapter.upsertCategory({ name: 'Shoes' }), { externalId: 'CATNEW', version: 3 });
});

test('adapter.pushProduct returns the catalog object id', async () => {
  const { fn } = stubFetch([jsonResponse(200, { catalog_object: { id: 'ITEM1', version: 1 } })]);
  const adapter = new SquareCatalogAdapter(new SquareClient({ accessToken: 't', fetchImpl: fn }));
  const draft: DraftProduct = {
    id: 'd3',
    itemType: 'SHOE',
    attributes: { name: 'Yeezy' },
    priceCents: 8000,
    status: 'READY',
    online: false,
  };
  assert.deepEqual(await adapter.pushProduct(draft), { externalId: 'ITEM1' });
});
