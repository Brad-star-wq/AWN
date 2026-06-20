import { LedgerRepository } from '../../src/ports/ledgerRepository';
import { CustomerRepository } from '../../src/ports/customerRepository';
import { DraftRepository } from '../../src/ports/draftRepository';

/**
 * One wired set of the three repositories that share a single backing store,
 * plus a cleanup hook. Every contract test gets a fresh, isolated set from a
 * factory, so the same scenarios run unchanged against the in-memory impls and
 * the Postgres impls.
 *
 * The ledger and customer repos must share their customer storage (the ledger
 * posts entries for customers the customer repo created) — exactly how the
 * real wiring works.
 */
export interface RepoSet {
  ledger: LedgerRepository;
  customers: CustomerRepository;
  drafts: DraftRepository;
  /** Release any resources / leave a clean slate after a test. */
  cleanup(): Promise<void>;
}

export type RepoSetFactory = () => Promise<RepoSet>;
