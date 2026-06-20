import { LedgerEntryFilter, LedgerRepository } from '../ports/ledgerRepository';
import { Cents, Customer, LedgerEntry, NewLedgerEntry } from '../domain/types';
import { InMemoryCustomerRepository } from './inMemoryCustomerRepository';

/**
 * In-memory ledger storage for tests and local development.
 *
 * Mirrors the guarantees the Postgres implementation must provide:
 *   • balance is summed from immutable entries, never stored;
 *   • appendEntry is idempotent on idempotencyKey.
 *
 * Customer storage is delegated to a shared `InMemoryCustomerRepository`, so
 * the ledger and intake never keep two diverging copies of who exists. Pass a
 * shared instance in to wire intake and reconciliation onto the same store.
 */
export class InMemoryLedgerRepository implements LedgerRepository {
  private entries: LedgerEntry[] = [];
  private byIdempotencyKey = new Map<string, LedgerEntry>();
  private seq = 0;

  constructor(private readonly customers = new InMemoryCustomerRepository()) {}

  /** Convenience for tests/seeding; delegates to the shared customer store. */
  addCustomer(customer: Customer): Customer {
    return this.customers.add(customer);
  }

  getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.getCustomer(customerId);
  }

  findCustomerByPosRef(posRef: string): Promise<Customer | null> {
    return this.customers.findByPosRef(posRef);
  }

  listCustomers(): Promise<Customer[]> {
    return this.customers.listCustomers();
  }

  async getBalance(customerId: string): Promise<Cents> {
    return this.entries
      .filter((e) => e.customerId === customerId)
      .reduce((sum, e) => sum + e.deltaCents, 0);
  }

  async ledgerTotals(): Promise<{ issuedCents: Cents; redeemedCents: Cents }> {
    let issuedCents = 0;
    let redeemedCents = 0;
    for (const e of this.entries) {
      if (e.deltaCents > 0) issuedCents += e.deltaCents;
      else redeemedCents += -e.deltaCents;
    }
    return { issuedCents, redeemedCents };
  }

  async appendEntry(entry: NewLedgerEntry): Promise<LedgerEntry> {
    // Idempotency: a duplicate key returns the existing entry, no double-post.
    if (entry.idempotencyKey) {
      const existing = this.byIdempotencyKey.get(entry.idempotencyKey);
      if (existing) return existing;
    }

    const stored: LedgerEntry = {
      ...entry,
      id: `entry_${++this.seq}`,
      createdAt: new Date().toISOString(),
    };
    this.entries.push(stored);
    if (stored.idempotencyKey) {
      this.byIdempotencyKey.set(stored.idempotencyKey, stored);
    }
    return stored;
  }

  async hasIdempotencyKey(key: string): Promise<boolean> {
    return this.byIdempotencyKey.has(key);
  }

  async listEntries(filter: LedgerEntryFilter = {}): Promise<LedgerEntry[]> {
    let rows = this.entries.map((e, i) => ({ e, i }));
    if (filter.customerId) rows = rows.filter((r) => r.e.customerId === filter.customerId);
    if (filter.sinceIso) rows = rows.filter((r) => r.e.createdAt >= filter.sinceIso!);
    // Newest first: by createdAt desc, then insertion order desc as the tiebreak.
    rows.sort((a, b) => (a.e.createdAt !== b.e.createdAt ? (a.e.createdAt < b.e.createdAt ? 1 : -1) : b.i - a.i));
    const out = rows.map((r) => r.e);
    return filter.limit != null ? out.slice(0, filter.limit) : out;
  }

  /** Test helper: every entry recorded, in order. */
  allEntries(): readonly LedgerEntry[] {
    return this.entries;
  }
}
