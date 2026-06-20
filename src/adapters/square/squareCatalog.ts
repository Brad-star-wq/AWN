import { randomUUID } from 'node:crypto';
import type { DraftProduct } from '../../domain/types';
import type { PosAdapter } from '../../ports/posAdapter';
import { SquareClient } from './squareClient';

/**
 * Square Catalog writes (connector walkthrough Part 4):
 *   - category upsert  (CatalogCategory from our Settings)
 *   - catalog item push (a finished draft → a Square ITEM)
 *
 * Both go through `UpsertCatalogObject` (`POST /v2/catalog/object`). Rules
 * baked in here, per the walkthrough:
 *   - **ITEMS_WRITE** scope is required (token concern; flagged to the owner).
 *   - **No sparse updates** — an update sends the FULL object plus its current
 *     `version` (optimistic concurrency). We never PATCH a subset of fields.
 *   - **Square auto-generates SKUs** — we never set or build a SKU.
 *   - **Categories are global**, not per-location, so no location id is sent.
 * Retry/backoff and the pinned `Square-Version` live in `SquareClient`.
 *
 * The body builders are pure so the request shape is unit-testable offline;
 * only the adapter methods touch the network.
 */

// ---- Category upsert -------------------------------------------------------

export interface CategoryUpsertInput {
  name: string;
  /** Existing Square catalog object id — present only when updating. */
  squareId?: string;
  /** The object's current version — REQUIRED to update (optimistic lock). */
  version?: number;
}

export function buildCategoryUpsertBody(input: CategoryUpsertInput, idempotencyKey: string) {
  const isUpdate = input.squareId !== undefined;
  const object: Record<string, unknown> = {
    type: 'CATEGORY',
    // New objects use a client-side temp id beginning with '#'; updates use the
    // real id. Either way we send the full category_data — no sparse update.
    id: isUpdate ? input.squareId : '#category',
    category_data: { name: input.name },
  };
  if (isUpdate && input.version !== undefined) object.version = input.version;
  return { idempotency_key: idempotencyKey, object };
}

// ---- Item push -------------------------------------------------------------

export interface ItemPushInput {
  name: string;
  description?: string;
  priceCents: number;
  /** Optional Square category id to file the item under. */
  categoryId?: string;
}

export function buildItemUpsertBody(input: ItemPushInput, idempotencyKey: string) {
  return {
    idempotency_key: idempotencyKey,
    object: {
      type: 'ITEM',
      id: '#item',
      item_data: {
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        ...(input.categoryId ? { categories: [{ id: input.categoryId }] } : {}),
        variations: [
          {
            type: 'ITEM_VARIATION',
            id: '#item_variation',
            item_variation_data: {
              item_id: '#item',
              name: 'Regular',
              pricing_type: 'FIXED_PRICING',
              price_money: { amount: input.priceCents, currency: 'USD' },
              // No `sku` — Square auto-generates it. We never build SKU logic.
            },
          },
        ],
      },
    },
  };
}

/** Map a finished draft to the fields Square needs. Requires a price. */
export function mapDraftToItem(draft: DraftProduct): ItemPushInput {
  if (draft.priceCents === undefined || !Number.isInteger(draft.priceCents) || draft.priceCents <= 0) {
    throw new Error(`Draft ${draft.id} has no valid priceCents — finish it before pushing.`);
  }
  const attrs = draft.attributes ?? {};
  const name =
    typeof attrs.name === 'string' && attrs.name.trim() ? attrs.name : `${draft.itemType} item`;
  const description = typeof attrs.description === 'string' ? attrs.description : undefined;
  const categoryId = typeof attrs.categoryId === 'string' ? attrs.categoryId : undefined;
  return {
    name,
    priceCents: draft.priceCents,
    ...(description ? { description } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
}

interface CatalogObjectResponse {
  catalog_object?: { id: string; version?: number | string };
  id_mappings?: Array<{ client_object_id: string; object_id: string }>;
}

/**
 * The Square side of the catalog writes. `pushProduct` matches the engine's
 * `PosAdapter` seam, so it can be dropped into `Drafts.pushToPos` in place of
 * the mock. `upsertCategory` is a Square-specific Settings operation and is not
 * part of the POS-agnostic port (the domain never calls it).
 */
export class SquareCatalogAdapter {
  constructor(private readonly client: SquareClient) {}

  async upsertCategory(
    input: CategoryUpsertInput,
  ): Promise<{ externalId: string; version: number }> {
    const body = buildCategoryUpsertBody(input, randomUUID());
    const res = (await this.client.post('/v2/catalog/object', body)) as CatalogObjectResponse;
    const obj = res.catalog_object;
    if (!obj?.id) throw new Error('Square category upsert returned no catalog_object id');
    return { externalId: obj.id, version: Number(obj.version ?? 0) };
  }

  async pushProduct(draft: DraftProduct): Promise<{ externalId: string }> {
    const body = buildItemUpsertBody(mapDraftToItem(draft), randomUUID());
    const res = (await this.client.post('/v2/catalog/object', body)) as CatalogObjectResponse;
    const obj = res.catalog_object;
    if (!obj?.id) throw new Error('Square item push returned no catalog_object id');
    return { externalId: obj.id };
  }
}

// Compile-time guarantee that pushProduct still satisfies the POS seam, so this
// adapter can replace the mock in Drafts.pushToPos without changing the domain.
type _PushConforms =
  SquareCatalogAdapter['pushProduct'] extends PosAdapter['pushProduct'] ? true : never;
const _pushConforms: _PushConforms = true;
void _pushConforms;
