import { Sql, Row } from 'postgres';
import { Cents, DraftProduct } from '../domain/types';
import { DraftFilter, DraftPatch, DraftRepository, NewDraft } from '../ports/draftRepository';

/**
 * Postgres-backed drafts, mapping to the `draft_products` table in
 * `db/schema.sql`. `update` is a read-merge-write of the mutable columns, so a
 * partial patch keeps the rest intact (matching the in-memory `{...row,
 * ...patch}` semantics). `pushed_at` is stamped the first time a draft becomes
 * `PUSHED`.
 */
export class PgDraftRepository implements DraftRepository {
  constructor(private readonly sql: Sql) {}

  /** Wrap arbitrary JSON attributes for a jsonb column. */
  private jsonb(value: Record<string, unknown>) {
    return this.sql.json(value as unknown as Parameters<Sql['json']>[0]);
  }

  async create(input: NewDraft): Promise<DraftProduct> {
    const [row] = await this.sql`
      insert into draft_products (source_customer_id, item_type, attributes, price_cents)
      values (
        ${input.sourceCustomerId ?? null},
        ${input.itemType},
        ${this.jsonb(input.attributes ?? {})},
        ${input.priceCents ?? null}
      )
      returning *
    `;
    return toDraft(row!);
  }

  async get(id: string): Promise<DraftProduct | null> {
    const [row] = await this.sql`select * from draft_products where id = ${id}`;
    return row ? toDraft(row) : null;
  }

  async list(filter?: DraftFilter): Promise<DraftProduct[]> {
    const status = filter?.status ?? null;
    const source = filter?.sourceCustomerId ?? null;
    const rows = await this.sql`
      select * from draft_products
      where (${status}::draft_status is null or status = ${status}::draft_status)
        and (${source}::uuid is null or source_customer_id = ${source}::uuid)
      order by created_at
    `;
    return rows.map(toDraft);
  }

  async update(id: string, patch: DraftPatch): Promise<DraftProduct> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Draft not found: ${id}`);
    const merged: DraftProduct = { ...existing, ...patch };

    const [row] = await this.sql`
      update draft_products set
        item_type       = ${merged.itemType}::item_type,
        attributes      = ${this.jsonb(merged.attributes)},
        price_cents     = ${merged.priceCents ?? null},
        status          = ${merged.status}::draft_status,
        online          = ${merged.online},
        pos_catalog_ref = ${merged.posCatalogRef ?? null},
        pushed_at       = case
                            when ${merged.status}::draft_status = 'PUSHED' and pushed_at is null
                            then now() else pushed_at
                          end
      where id = ${id}
      returning *
    `;
    return toDraft(row!);
  }
}

export function toDraft(row: Row): DraftProduct {
  const priceCents = row.price_cents;
  return {
    id: row.id as string,
    ...(row.source_customer_id != null ? { sourceCustomerId: row.source_customer_id as string } : {}),
    itemType: row.item_type as DraftProduct['itemType'],
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    ...(priceCents != null ? { priceCents: Number(priceCents) as Cents } : {}),
    status: row.status as DraftProduct['status'],
    online: row.online as boolean,
    ...(row.pos_catalog_ref != null ? { posCatalogRef: row.pos_catalog_ref as string } : {}),
    ...(row.created_at != null
      ? { createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) }
      : {}),
  };
}
