/**
 * `npm run db:setup` — make sure the schema exists in the target database.
 *
 * Non-destructive: applies `db/schema.sql` only if the `customers` table is
 * absent, so running it against a populated database is a safe no-op. It never
 * drops or truncates anything.
 */
import { createSql, ensureSchema } from './client';

async function main(): Promise<void> {
  const sql = createSql();
  try {
    const [before] = await sql<{ present: boolean }[]>`
      select to_regclass('public.customers') is not null as present
    `;
    if (before?.present) {
      console.log('Schema already present — nothing to do.');
    } else {
      await ensureSchema(sql);
      console.log('Schema created from db/schema.sql.');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
