import { Customer } from '../domain/types';
import { CustomerRepository, NewCustomer } from '../ports/customerRepository';

/**
 * In-memory customer store, shared as the single source of truth.
 *
 * The in-memory ledger repo delegates its customer lookups here, so a customer
 * created at intake is immediately visible to the ledger and to the
 * reconciliation balance sweep.
 */
export class InMemoryCustomerRepository implements CustomerRepository {
  private customers = new Map<string, Customer>();
  private byPosRef = new Map<string, string>();
  private byPhone = new Map<string, string>();
  private seq = 0;

  /** Insert a fully-formed customer (tests/seeding). */
  add(customer: Customer): Customer {
    this.customers.set(customer.id, customer);
    if (customer.posCustomerRef) this.byPosRef.set(customer.posCustomerRef, customer.id);
    if (customer.phone) this.byPhone.set(customer.phone, customer.id);
    return customer;
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.customers.get(id) ?? null;
  }

  async findByPosRef(posRef: string): Promise<Customer | null> {
    const id = this.byPosRef.get(posRef);
    return id ? this.customers.get(id) ?? null : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const id = this.byPhone.get(phone);
    return id ? this.customers.get(id) ?? null : null;
  }

  async listCustomers(): Promise<Customer[]> {
    return [...this.customers.values()];
  }

  async create(input: NewCustomer): Promise<Customer> {
    const customer: Customer = {
      id: `cust_${++this.seq}`,
      displayName: input.displayName,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.posCustomerRef !== undefined ? { posCustomerRef: input.posCustomerRef } : {}),
    };
    return this.add(customer);
  }
}
