import { Sql, Row } from 'postgres';
import {
  FinalizeUpdate,
  NewRedemption,
  Redemption,
  RedemptionRepository,
  RedemptionStatus,
  RedemptionOrigin,
} from '../ports/redemptionRepository';

/**
 * Postgres-backed redemptions store, mapping to the `redemptions` table in
 * db/redemptions.sql. Same interface (and same behavior) as the in-memory
 * store, so the tested spine runs against either. Pass the engine's shared
 * pooler `Sql` so the serverless webhook reuses one pool.
 */

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
}

function toRedemption(row: Row): Redemption {
  return {
    id: row.id as string,
    customerId: (row.customer_id as string | null) ?? null,
    amountCents: Number(row.amount_cents),
    locationId: (row.location_id as string | null) ?? null,
    squarePaymentId: (row.square_payment_id as string | null) ?? null,
    squareOrderId: (row.square_order_id as string | null) ?? null,
    origin: row.origin as RedemptionOrigin,
    status: row.status as RedemptionStatus,
    ledgerEntryId: (row.ledger_entry_id as string | null) ?? null,
    flags: (row.flags as Record<string, unknown> | null) ?? null,
    attributionAttempt: Number(row.attribution_attempt),
    createdAt: toIso(row.created_at),
    finalizedAt: row.finalized_at != null ? toIso(row.finalized_at) : null,
    updatedAt: toIso(row.updated_at),
  };
}

export class PgRedemptionRepository implements RedemptionRepository {
  constructor(private readonly sql: Sql) {}

  async create(input: NewRedemption): Promise<Redemption> {
    const status: RedemptionStatus = input.status ?? 'awaiting_attribution';
    // ON CONFLICT on the UNIQUE payment id makes create idempotent under a
    // webhook replay/race: the duplicate insert is a no-op, then we return the
    // existing row. (A null payment id never conflicts, so it always inserts.)
    const [inserted] = await this.sql`
      insert into redemptions
        (customer_id, amount_cents, location_id, square_payment_id, square_order_id, origin, status)
      values (
        ${input.customerId ?? null}::uuid, ${input.amountCents}, ${input.locationId ?? null},
        ${input.squarePaymentId ?? null}, ${input.squareOrderId ?? null},
        ${input.origin}::redemption_origin, ${status}::redemption_status
      )
      on conflict (square_payment_id) do nothing
      returning *
    `;
    if (inserted) return toRedemption(inserted);

    if (input.squarePaymentId) {
      const existing = await this.getByPaymentId(input.squarePaymentId);
      if (existing) return existing;
    }
    throw new Error('create redemption: insert returned no row and no existing row was found');
  }

  async getById(id: string): Promise<Redemption | null> {
    const [row] = await this.sql`select * from redemptions where id = ${id}::uuid`;
    return row ? toRedemption(row) : null;
  }

  async getByPaymentId(squarePaymentId: string): Promise<Redemption | null> {
    const [row] = await this.sql`
      select * from redemptions where square_payment_id = ${squarePaymentId} limit 1
    `;
    return row ? toRedemption(row) : null;
  }

  async listAwaitingAttribution(): Promise<Redemption[]> {
    const rows = await this.sql`
      select * from redemptions
       where status = 'awaiting_attribution'
       order by created_at desc
    `;
    return rows.map(toRedemption);
  }

  async listByCustomer(customerId: string): Promise<Redemption[]> {
    const rows = await this.sql`
      select * from redemptions where customer_id = ${customerId}::uuid
       order by created_at desc
    `;
    return rows.map(toRedemption);
  }

  async markFinalized(id: string, update: FinalizeUpdate): Promise<Redemption> {
    const flags = update.negativeBalance ? this.sql.json({ negative_balance: true }) : null;
    const [row] = await this.sql`
      update redemptions
         set customer_id     = ${update.customerId}::uuid,
             square_payment_id = coalesce(${update.squarePaymentId ?? null}, square_payment_id),
             square_order_id  = coalesce(${update.squareOrderId ?? null}, square_order_id),
             ledger_entry_id  = ${update.ledgerEntryId}::uuid,
             status           = 'finalized',
             flags            = ${flags},
             finalized_at     = now(),
             updated_at       = now()
       where id = ${id}::uuid
      returning *
    `;
    if (!row) throw new Error(`Cannot finalize redemption ${id} (missing)`);
    return toRedemption(row);
  }

  async markReversed(id: string): Promise<Redemption> {
    const [row] = await this.sql`
      update redemptions set status = 'reversed', updated_at = now()
       where id = ${id}::uuid
      returning *
    `;
    if (!row) throw new Error(`Cannot reverse redemption ${id} (missing)`);
    return toRedemption(row);
  }

  async requeue(id: string): Promise<Redemption> {
    const [row] = await this.sql`
      update redemptions
         set status              = 'awaiting_attribution',
             customer_id         = null,
             ledger_entry_id     = null,
             flags               = null,
             finalized_at        = null,
             attribution_attempt = attribution_attempt + 1,
             updated_at          = now()
       where id = ${id}::uuid
      returning *
    `;
    if (!row) throw new Error(`Cannot requeue redemption ${id} (missing)`);
    return toRedemption(row);
  }
}
