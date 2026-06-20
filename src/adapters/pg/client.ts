import { readFileSync } from 'node:fs';
import postgres, { Sql } from 'postgres';

/**
 * Postgres connection for the production storage adapters.
 *
 * The connection string comes from `DATABASE_URL` — never hardcoded, never
 * committed (`.env` is gitignored; see `.env.example`). SSL is on by default
 * (Supabase requires it); `prepare: false` keeps it compatible with Supabase's
 * transaction pooler, which does not support prepared statements.
 */
export function createSql(connectionString = process.env.DATABASE_URL): Sql {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — point it at your Postgres/Supabase database.');
  }
  const sslDisabled =
    process.env.DATABASE_SSL === 'disable' || /[?&]sslmode=disable/.test(connectionString);

  return postgres(connectionString, {
    ssl: sslDisabled ? false : 'require',
    prepare: false,
    max: 5,
    onnotice: () => {}, // quiet the NOTICE chatter from DDL
  });
}

/** Absolute path to db/schema.sql, resolved relative to this file. */
const SCHEMA_PATH = new URL('../../../db/schema.sql', import.meta.url);

/**
 * Create the schema if it isn't there yet.
 *
 * Idempotent and non-destructive: it checks for the `customers` table and only
 * runs `db/schema.sql` when the schema is absent, so it never wipes data. Use
 * `truncateAll` for test isolation instead.
 */
export async function ensureSchema(sql: Sql): Promise<void> {
  const [row] = await sql<{ present: boolean }[]>`
    select to_regclass('public.customers') is not null as present
  `;
  if (row?.present) return;
  const ddl = readFileSync(SCHEMA_PATH, 'utf8');
  await sql.unsafe(ddl); // simple-protocol multi-statement DDL
}

/** Wipe all engine tables. For test isolation only — never call this in the demo. */
export async function truncateAll(sql: Sql): Promise<void> {
  await sql`truncate table credit_ledger, draft_products, sale_events, customers restart identity cascade`;
}
