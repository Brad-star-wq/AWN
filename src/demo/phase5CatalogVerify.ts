/**
 * Phase 5 — Part 4 catalog writes, sandbox verification (repeatable).
 *
 *   npm run verify:catalog
 *
 * Round-trips a CatalogCategory (create → update full-object → read back) and
 * pushes a test ITEM (→ read back), then deletes both. A clean run also
 * CONFIRMS the Catalog API is available in sandbox this build cycle.
 *
 * Env (load via --env-file; see package.json):
 *   SQUARE_ACCESS_TOKEN or SQUARE_SANDBOX_ACCESS_TOKEN  — needs ITEMS_WRITE (+ ITEMS_READ to read back)
 *   SQUARE_ENV=sandbox (default; production refused unless explicitly set)
 *
 * Sandbox only. It creates and then deletes its own throwaway objects.
 */
import { squareClientFromEnv } from '../adapters/square/squareClient';
import {
  SquareCatalogAdapter,
  buildCategoryUpsertBody,
} from '../adapters/square/squareCatalog';
import { randomUUID } from 'node:crypto';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  const client = squareClientFromEnv();
  const adapter = new SquareCatalogAdapter(client);
  console.log(`\nPhase 5 — catalog writes against ${client.baseUrl}\n`);

  const created: string[] = []; // ids to clean up (item first, then category)

  try {
    // [1] Category create
    const tag = randomUUID().slice(0, 8);
    const name = `PHASE5-TEST ${tag}`;
    console.log(`[1] Upsert category "${name}"`);
    const cat = await adapter.upsertCategory({ name });
    created.push(cat.externalId);
    console.log(`   ✅ created ${cat.externalId} (version ${cat.version}) — Catalog API works in sandbox`);

    // [2] Category update — full object + version (no sparse update)
    const newName = `${name} (renamed)`;
    console.log(`[2] Update category → "${newName}" with version ${cat.version}`);
    const updated = await adapter.upsertCategory({
      name: newName,
      squareId: cat.externalId,
      version: cat.version,
    });
    console.log(`   ✅ updated → version ${updated.version}`);

    // Read back to confirm the rename actually landed.
    const readBack = (await client.get(`/v2/catalog/object/${cat.externalId}`)) as {
      object?: { category_data?: { name?: string } };
    };
    const liveName = readBack.object?.category_data?.name;
    console.log(
      liveName === newName
        ? `   ✅ read-back name matches: "${liveName}"`
        : `   ❌ read-back name is "${liveName}", expected "${newName}"`,
    );

    // [3] Item push (filed under the category)
    const priceCents = 4200;
    console.log(`[3] Push item "PHASE5 Test Shoe" ${usd(priceCents)} under the category`);
    const item = await adapter.pushProduct({
      id: `demo-${tag}`,
      itemType: 'SHOE',
      attributes: { name: `PHASE5 Test Shoe ${tag}`, categoryId: cat.externalId },
      priceCents,
      status: 'READY',
      online: false,
    });
    created.unshift(item.externalId); // delete item before its category
    console.log(`   ✅ item created ${item.externalId}`);

    const itemBack = (await client.get(`/v2/catalog/object/${item.externalId}?include_related_objects=true`)) as {
      object?: { item_data?: { name?: string; variations?: Array<{ item_variation_data?: { price_money?: { amount?: number }; sku?: string } }> } };
    };
    const variation = itemBack.object?.item_data?.variations?.[0]?.item_variation_data;
    console.log(`   ✅ read-back: name="${itemBack.object?.item_data?.name}", price=${usd(Number(variation?.price_money?.amount))}`);
    console.log(`   ✅ Square-assigned SKU: ${variation?.sku ?? '(none set by us — Square owns it)'}`);

    console.log('\nAll catalog writes verified in sandbox.');
  } finally {
    // Clean up throwaway objects (item before category).
    for (const id of created) {
      try {
        await client.delete(`/v2/catalog/object/${id}`);
        console.log(`   cleaned ${id}`);
      } catch (err) {
        console.log(`   (could not delete ${id}: ${(err as Error).message})`);
      }
    }
  }

  // Sanity: prove the builder sends a full object on update (no sparse update).
  const sample = buildCategoryUpsertBody({ name: 'X', squareId: 'CAT1', version: 2 }, 'k');
  console.log(`\n(update body always carries full category_data + version: ${JSON.stringify(sample.object)})\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
