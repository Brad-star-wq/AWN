import 'server-only';

import { createSql } from '@engine/adapters/pg/client';
import { PgCustomerRepository } from '@engine/adapters/pgCustomerRepository';
import { PgLedgerRepository } from '@engine/adapters/pgLedgerRepository';
import { PgDraftRepository } from '@engine/adapters/pgDraftRepository';
import { Ledger } from '@engine/domain/ledger';
import { Drafts } from '@engine/domain/drafts';
import { MockPosAdapter } from '@engine/adapters/mockPosAdapter';

/**
 * The one place the app wires the Phase 4 Postgres repositories to the engine
 * services. `import 'server-only'` makes this a build error if it is ever
 * pulled into a client bundle — the engine and the database never reach the
 * browser.
 *
 * Instances are cached on `globalThis` so Next's dev hot-reload reuses one
 * Postgres connection pool instead of opening a new one on every edit.
 */
function build() {
  const sql = createSql(); // reads DATABASE_URL
  const customers = new PgCustomerRepository(sql);
  const ledgerRepo = new PgLedgerRepository(sql, customers);
  const draftRepo = new PgDraftRepository(sql);

  return {
    sql,
    customers,
    ledgerRepo,
    draftRepo,
    ledger: new Ledger(ledgerRepo),
    drafts: new Drafts(draftRepo),
    // Draft pushes go through the MOCK adapter until the Phase 5 Square adapter
    // is wired (its in-memory catalog is fine for this phase).
    pos: new MockPosAdapter(),
  };
}

type Engine = ReturnType<typeof build>;

const globalForEngine = globalThis as unknown as { __engine?: Engine };

export const engine: Engine = globalForEngine.__engine ?? (globalForEngine.__engine = build());
