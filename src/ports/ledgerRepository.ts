import { Cents, Customer, LedgerEntry, NewLedgerEntry } from '../domain/types';

/** Read filter for `listEntries`. All fields optional and AND-combined. */
export interface LedgerEntryFilter {
  /** Only this customer's entries. */
  customerId?: string;
  /** Only entries with `createdAt >= sinceIso`. */
  sinceIso?: string;
  /** Cap the number of rows returned. */
  limit?: number;
}

/**
 * Storage contract for the credit ledger.
 *
 * The ledger logic depends only on this interface, never on a concrete
 * database. An in-memory implementation backs the tests; a Postgres
 * implementation backs production. Swapping them changes nothing in the
 * domain logic.
 *
 * Idempotency note: `appendEntry` MUST be idempotent on `idempotencyKey`.
 * If an entry with the same key already exists, it returns the existing
 * entry instead of writing a duplicate. In Postgres this is a unique
 * constraint + on-conflict; in memory it's a key check. Either way, a
 * replayed event can never double-post.
 */
export interface LedgerRepository {
  getCustomer(customerId: string): Promise<Customer | null>;

  /** Resolve a customer by their POS id (the sale-matching join key). */
  findCustomerByPosRef(posRef: string): Promise<Customer | null>;

  /** Every known customer — the balance sweep reconciliation runs over. */
  listCustomers(): Promise<Customer[]>;

  /** Balance = SUM(delta_cents) for the customer. */
  getBalance(customerId: string): Promise<Cents>;

  /**
   * Whole-ledger aggregates for the reconciliation report:
   * `issuedCents` = sum of positive deltas, `redeemedCents` = sum of the
   * absolute value of negative deltas. (In Postgres: two filtered `SUM`s.)
   */
  ledgerTotals(): Promise<{ issuedCents: Cents; redeemedCents: Cents }>;

  /**
   * Append a ledger entry. Idempotent on `idempotencyKey`:
   * a duplicate key returns the existing entry rather than inserting.
   */
  appendEntry(entry: NewLedgerEntry): Promise<LedgerEntry>;

  /** Whether an entry with this idempotency key already exists. */
  hasIdempotencyKey(key: string): Promise<boolean>;

  /**
   * Ledger entries, newest first — for the dashboard's credit history and
   * recent-activity reads. Optionally scoped to a customer, a time window, and
   * a row cap. Pure read; the balance is still always `SUM(delta_cents)`.
   */
  listEntries(filter?: LedgerEntryFilter): Promise<LedgerEntry[]>;
}
