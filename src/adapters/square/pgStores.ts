import { Sql, Row } from 'postgres';
import {
  NewPendingRedemption,
  PendingRedemption,
  PendingRedemptionStore,
  ReconcileInfo,
  WebhookEventStore,
} from './pendingRedemptions';
import { AlertStore, NewAlert, ReconciliationAlert } from './alerts';

/**
 * Postgres-backed reconciliation stores, mapping to the Phase 5 tables in
 * `db/phase5_tables.sql`. Same interfaces as the in-memory stores, so the
 * tested matcher/refund logic runs against either unchanged.
 *
 * Connection: pass the engine's shared `Sql` (the Supabase *pooler* connection
 * from `DATABASE_URL`) so the serverless webhook reuses one pool instead of
 * exhausting direct connections.
 */

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
}

function toPending(row: Row): PendingRedemption {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    amountCents: Number(row.amount_cents),
    locationId: row.location_id as string,
    createdAt: toIso(row.created_at),
    status: row.status as PendingRedemption['status'],
    ...(row.reconciled_payment_id != null
      ? { reconciledPaymentId: row.reconciled_payment_id as string }
      : {}),
    ...(row.reconciled_at != null ? { reconciledAt: toIso(row.reconciled_at) } : {}),
    ...(row.ledger_entry_id != null ? { ledgerEntryId: row.ledger_entry_id as string } : {}),
  };
}

export class PgPendingRedemptionStore implements PendingRedemptionStore {
  constructor(private readonly sql: Sql) {}

  async create(input: NewPendingRedemption): Promise<PendingRedemption> {
    const [row] = await this.sql`
      insert into pending_redemptions (customer_id, amount_cents, location_id, created_at)
      values (${input.customerId}::uuid, ${input.amountCents}, ${input.locationId},
              ${input.createdAt}::timestamptz)
      returning *
    `;
    return toPending(row!);
  }

  async get(id: string): Promise<PendingRedemption | null> {
    const [row] = await this.sql`select * from pending_redemptions where id = ${id}::uuid`;
    return row ? toPending(row) : null;
  }

  async listOpen(): Promise<PendingRedemption[]> {
    const rows = await this.sql`select * from pending_redemptions where status = 'PENDING'`;
    return rows.map(toPending);
  }

  async findByReconciledPaymentId(paymentId: string): Promise<PendingRedemption | null> {
    const [row] = await this.sql`
      select * from pending_redemptions where reconciled_payment_id = ${paymentId} limit 1
    `;
    return row ? toPending(row) : null;
  }

  async markReconciled(id: string, info: ReconcileInfo): Promise<PendingRedemption> {
    const [row] = await this.sql`
      update pending_redemptions
         set status = 'RECONCILED',
             reconciled_payment_id = ${info.paymentId},
             reconciled_at = ${info.reconciledAt}::timestamptz,
             ledger_entry_id = ${info.ledgerEntryId}::uuid
       where id = ${id}::uuid and status <> 'EXPIRED'
      returning *
    `;
    if (!row) throw new Error(`Cannot reconcile pending redemption ${id} (missing or expired)`);
    return toPending(row);
  }

  async markExpired(id: string): Promise<PendingRedemption> {
    const [row] = await this.sql`
      update pending_redemptions set status = 'EXPIRED'
       where id = ${id}::uuid and status <> 'RECONCILED'
      returning *
    `;
    if (!row) throw new Error(`Cannot expire pending redemption ${id} (missing or reconciled)`);
    return toPending(row);
  }
}

export class PgWebhookEventStore implements WebhookEventStore {
  constructor(private readonly sql: Sql) {}

  async hasProcessed(eventId: string): Promise<boolean> {
    const rows = await this.sql`select 1 from square_webhook_events where event_id = ${eventId} limit 1`;
    return rows.length > 0;
  }

  async markProcessed(eventId: string): Promise<void> {
    // The PRIMARY KEY on event_id is the real idempotency guard: a duplicate
    // delivery conflicts and is a no-op, even under concurrent processing.
    await this.sql`
      insert into square_webhook_events (event_id) values (${eventId})
      on conflict (event_id) do nothing
    `;
  }
}

function toAlert(row: Row): ReconciliationAlert {
  return {
    id: row.id as string,
    kind: row.kind as ReconciliationAlert['kind'],
    ...(row.payment_id != null ? { paymentId: row.payment_id as string } : {}),
    ...(row.refund_id != null ? { refundId: row.refund_id as string } : {}),
    ...(row.amount_cents != null ? { amountCents: Number(row.amount_cents) } : {}),
    ...(row.location_id != null ? { locationId: row.location_id as string } : {}),
    ...(row.pending_id != null ? { pendingId: row.pending_id as string } : {}),
    ...(row.detail != null ? { detail: row.detail } : {}),
    ...(row.resolved_at != null ? { resolvedAt: toIso(row.resolved_at) } : {}),
    createdAt: toIso(row.created_at),
  };
}

export class PgAlertStore implements AlertStore {
  constructor(private readonly sql: Sql) {}

  async record(alert: NewAlert): Promise<ReconciliationAlert> {
    const [row] = await this.sql`
      insert into reconciliation_alerts
        (kind, payment_id, refund_id, amount_cents, location_id, pending_id, detail)
      values (
        ${alert.kind}, ${alert.paymentId ?? null}, ${alert.refundId ?? null},
        ${alert.amountCents ?? null}, ${alert.locationId ?? null}, ${alert.pendingId ?? null},
        ${alert.detail !== undefined ? this.sql.json(alert.detail as never) : null}
      )
      returning *
    `;
    return toAlert(row!);
  }

  async listOpen(): Promise<ReconciliationAlert[]> {
    const rows = await this.sql`
      select * from reconciliation_alerts where resolved_at is null order by created_at desc
    `;
    return rows.map(toAlert);
  }
}
