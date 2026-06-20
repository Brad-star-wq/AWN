import { Sql, Row } from 'postgres';
import { Cents, Customer, LedgerEntry, NewLedgerEntry } from '../domain/types';
import { LedgerEntryFilter, LedgerRepository } from '../ports/ledgerRepository';
import { CustomerRepository } from '../ports/customerRepository';
import { PgCustomerRepository } from './pgCustomerRepository';

/**
 * Postgres-backed credit ledger, mapping to the `credit_ledger` table in
 * `db/schema.sql`. Balance is always `SUM(delta_cents)` — there is no stored
 * balance column to drift. Customer lookups delegate to a `CustomerRepository`
 * over the same connection, mirroring the in-memory repo's shared store.
 *
 * Idempotency lives in `appendEntry` (not the caller): see the Phase 4
 * concurrency notes in BUILD_PLAN.md. The unique constraint on
 * `idempotency_key` is the real guard; two concurrent copies of the same event
 * can both pass `hasIdempotencyKey`, but only one row can be inserted.
 */
export class PgLedgerRepository implements LedgerRepository {
  private readonly customers: CustomerRepository;

  constructor(private readonly sql: Sql, customers?: CustomerRepository) {
    this.customers = customers ?? new PgCustomerRepository(sql);
  }

  getCustomer(id: string): Promise<Customer | null> {
    return this.customers.getCustomer(id);
  }

  findCustomerByPosRef(posRef: string): Promise<Customer | null> {
    return this.customers.findByPosRef(posRef);
  }

  listCustomers(): Promise<Customer[]> {
    return this.customers.listCustomers();
  }

  async getBalance(customerId: string): Promise<Cents> {
    const [row] = await this.sql`
      select coalesce(sum(delta_cents), 0) as balance
      from credit_ledger where customer_id = ${customerId}
    `;
    return Number(row!.balance);
  }

  async ledgerTotals(): Promise<{ issuedCents: Cents; redeemedCents: Cents }> {
    const [row] = await this.sql`
      select
        coalesce(sum(delta_cents) filter (where delta_cents > 0), 0)  as issued,
        coalesce(sum(-delta_cents) filter (where delta_cents < 0), 0) as redeemed
      from credit_ledger
    `;
    return { issuedCents: Number(row!.issued), redeemedCents: Number(row!.redeemed) };
  }

  async hasIdempotencyKey(key: string): Promise<boolean> {
    const rows = await this.sql`select 1 from credit_ledger where idempotency_key = ${key} limit 1`;
    return rows.length > 0;
  }

  async listEntries(filter: LedgerEntryFilter = {}): Promise<LedgerEntry[]> {
    const customerId = filter.customerId ?? null;
    const sinceIso = filter.sinceIso ?? null;
    const limit = filter.limit ?? null;
    const rows = await this.sql`
      select * from credit_ledger
      where (${customerId}::uuid is null or customer_id = ${customerId}::uuid)
        and (${sinceIso}::timestamptz is null or created_at >= ${sinceIso}::timestamptz)
      order by created_at desc
      limit ${limit}
    `;
    return rows.map(toEntry);
  }

  async appendEntry(entry: NewLedgerEntry): Promise<LedgerEntry> {
    // INSERT ... ON CONFLICT DO NOTHING is the atomic idempotency guard. With a
    // non-null key that already exists, nothing is returned — then we SELECT the
    // existing row. A null key never conflicts, so it always inserts.
    const [inserted] = await this.sql`
      insert into credit_ledger
        (customer_id, kind, delta_cents, source, source_ref, idempotency_key, note, created_by)
      values (
        ${entry.customerId}, ${entry.kind}, ${entry.deltaCents}, ${entry.source},
        ${entry.sourceRef ?? null}, ${entry.idempotencyKey ?? null},
        ${entry.note ?? null}, ${entry.createdBy ?? null}
      )
      on conflict (idempotency_key) do nothing
      returning *
    `;
    if (inserted) return toEntry(inserted);

    // Nothing inserted ⇒ a row with this idempotency_key already exists.
    const [existing] = await this.sql`
      select * from credit_ledger where idempotency_key = ${entry.idempotencyKey ?? null}
    `;
    if (!existing) {
      // Shouldn't happen: no insert and no conflicting row.
      throw new Error('appendEntry: insert returned no row and no existing entry was found');
    }
    return toEntry(existing);
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
}

export function toEntry(row: Row): LedgerEntry {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    kind: row.kind as LedgerEntry['kind'],
    deltaCents: Number(row.delta_cents),
    source: row.source as LedgerEntry['source'],
    ...(row.source_ref != null ? { sourceRef: row.source_ref as string } : {}),
    ...(row.idempotency_key != null ? { idempotencyKey: row.idempotency_key as string } : {}),
    ...(row.note != null ? { note: row.note as string } : {}),
    ...(row.created_by != null ? { createdBy: row.created_by as string } : {}),
    createdAt: toIso(row.created_at),
  };
}
