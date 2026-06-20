import { Sql, Row } from 'postgres';
import { Customer } from '../domain/types';
import { CustomerRepository, NewCustomer } from '../ports/customerRepository';

/**
 * Postgres-backed customers, mapping to the `customers` table in
 * `db/schema.sql`. Null columns map back to `undefined` so the shapes match
 * the in-memory repo exactly (the contract test asserts this).
 */
export class PgCustomerRepository implements CustomerRepository {
  constructor(private readonly sql: Sql) {}

  async getCustomer(id: string): Promise<Customer | null> {
    const [row] = await this.sql`select * from customers where id = ${id}`;
    return row ? toCustomer(row) : null;
  }

  async findByPosRef(posRef: string): Promise<Customer | null> {
    const [row] = await this.sql`select * from customers where pos_customer_ref = ${posRef} limit 1`;
    return row ? toCustomer(row) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    // Most-recent wins, matching the in-memory store's last-writer semantics.
    const [row] = await this.sql`
      select * from customers where phone = ${phone} order by created_at desc limit 1
    `;
    return row ? toCustomer(row) : null;
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await this.sql`select * from customers order by created_at`;
    return rows.map(toCustomer);
  }

  async create(input: NewCustomer): Promise<Customer> {
    const [row] = await this.sql`
      insert into customers (display_name, phone, pos_customer_ref)
      values (${input.displayName}, ${input.phone ?? null}, ${input.posCustomerRef ?? null})
      returning *
    `;
    return toCustomer(row!);
  }
}

export function toCustomer(row: Row): Customer {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    ...(row.phone != null ? { phone: row.phone as string } : {}),
    ...(row.pos_customer_ref != null ? { posCustomerRef: row.pos_customer_ref as string } : {}),
  };
}
