import { test, before, after } from 'node:test';
import { createSql, ensureSchema, truncateAll } from '../src/adapters/pg/client';
import { PgCustomerRepository } from '../src/adapters/pgCustomerRepository';
import { PgLedgerRepository } from '../src/adapters/pgLedgerRepository';
import { PgDraftRepository } from '../src/adapters/pgDraftRepository';
import { RepoSet } from './contracts/support';
import { ledgerRepositoryContract } from './contracts/ledgerRepository.contract';
import { customerRepositoryContract } from './contracts/customerRepository.contract';
import { draftRepositoryContract } from './contracts/draftRepository.contract';

/**
 * The same repository contracts, run against the real Postgres implementations.
 *
 * Requires DATABASE_URL (loaded via `npm run test:pg`, which reads .env). We
 * skip — rather than fail — in two cases, so the suite stays green wherever it
 * runs:
 *   • DATABASE_URL is unset (plain `npm test`, offline);
 *   • the database is unreachable (e.g. a Supabase *direct* URL on an IPv4-only
 *     network — use the Session pooler URL instead).
 * When the database is reachable, every contract runs against it.
 */
const url = process.env.DATABASE_URL;

async function probe(sql: ReturnType<typeof createSql>): Promise<string | null> {
  try {
    await sql`select 1`;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

if (!url) {
  test('Postgres repository contracts', { skip: 'DATABASE_URL not set (run `npm run test:pg`)' }, () => {});
} else {
  const sql = createSql(url);
  const unreachable = await probe(sql);

  if (unreachable) {
    await sql.end({ timeout: 5 });
    test(
      'Postgres repository contracts',
      { skip: `database unreachable (${unreachable}) — check DATABASE_URL; on IPv4 use the Supabase Session pooler URL` },
      () => {},
    );
  } else {
    before(async () => {
      await ensureSchema(sql);
    });
    after(async () => {
      await sql.end({ timeout: 5 });
    });

    // Each contract test gets a clean database (truncate) and repos sharing one
    // connection — the ledger and customer repos hit the same `customers` table.
    const pgRepoSet = async (): Promise<RepoSet> => {
      await truncateAll(sql);
      const customers = new PgCustomerRepository(sql);
      const ledger = new PgLedgerRepository(sql, customers);
      const drafts = new PgDraftRepository(sql);
      return { ledger, customers, drafts, cleanup: async () => {} };
    };

    ledgerRepositoryContract('pg', pgRepoSet);
    customerRepositoryContract('pg', pgRepoSet);
    draftRepositoryContract('pg', pgRepoSet);
  }
}
