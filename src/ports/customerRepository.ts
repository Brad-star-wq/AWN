import { Customer } from '../domain/types';

/** The fields needed to create a customer; the store assigns the id. */
export interface NewCustomer {
  displayName: string;
  phone?: string;
  /** The POS customer id, if already linked (the sale-matching join key). */
  posCustomerRef?: string;
}

/**
 * Storage contract for customers.
 *
 * Intake finds-or-creates through this port; the ledger and reconciliation
 * resolve customers through it too. Keeping it a single port is what lets the
 * in-memory ledger repo and the customer repo share one customer store — one
 * source of truth, no drift between "who has credit" and "who exists".
 */
export interface CustomerRepository {
  getCustomer(id: string): Promise<Customer | null>;

  /** Resolve by POS id (the sale-matching join key). */
  findByPosRef(posRef: string): Promise<Customer | null>;

  /** Resolve by phone — the counter's natural lookup at intake. */
  findByPhone(phone: string): Promise<Customer | null>;

  listCustomers(): Promise<Customer[]>;

  create(input: NewCustomer): Promise<Customer>;
}
