/**
 * `npm run demo:pg` — the engine running against real Postgres.
 *
 * Unlike the in-memory demo, this one PERSISTS. The whole flow is idempotent
 * (find-or-create the customer by phone, issue credit under a fixed key, apply
 * sales keyed by event id), so running it twice does not double-post: the
 * second run finds the same balances already in the database. Run it, then run
 * it again and watch the "before this run" balances carry over.
 *
 * It is non-destructive — it never truncates. Use `npm run test:pg` (which
 * truncates for isolation) for the contract tests, not this.
 */
import { Ledger } from '../domain/ledger';
import { createIntake } from '../domain/intake';
import { Drafts } from '../domain/drafts';
import { reconcileDay } from '../domain/reconciliation';
import { createSql, ensureSchema } from '../adapters/pg/client';
import { PgCustomerRepository } from '../adapters/pgCustomerRepository';
import { PgLedgerRepository } from '../adapters/pgLedgerRepository';
import { PgDraftRepository } from '../adapters/pgDraftRepository';
import { MockPosAdapter } from '../adapters/mockPosAdapter';
import { SaleEvent } from '../domain/types';
import { RULE, money, heading } from './format';

const OCCURRED_AT = '2026-06-18T10:15:00.000-04:00';

async function main(): Promise<void> {
  const sql = createSql();
  await ensureSchema(sql);

  const customers = new PgCustomerRepository(sql);
  const ledgerRepo = new PgLedgerRepository(sql, customers);
  const ledger = new Ledger(ledgerRepo);
  const draftRepo = new PgDraftRepository(sql);
  const drafts = new Drafts(draftRepo);
  const pos = new MockPosAdapter();

  try {
    console.log(RULE);
    console.log('  RESALE ENGINE — POSTGRES DEMO (persistent)');
    console.log(RULE);

    // ---- What's already in the database from prior runs -------------------
    heading('BEFORE THIS RUN  (state persisted in Postgres)');
    const existing = await customers.listCustomers();
    if (existing.length === 0) {
      console.log('  (empty — this looks like the first run)');
    } else {
      for (const c of existing) {
        console.log(`  ${c.displayName.padEnd(10)} ${money(await ledger.getBalance(c.id)).padStart(9)}`);
      }
    }

    // ---- Idempotent intake (issue credit + one draft, once) ---------------
    heading('INTAKE  (idempotent — re-running does not double-issue)');

    const marcus = await createIntake(
      {
        customer: { displayName: 'Marcus T.', phone: '555-0100', posCustomerRef: 'sq_marcus' },
        creditCents: 5000,
        items: [], // drafts handled separately below to avoid duplicating on re-run
        idempotencyKey: 'intake:marcus:opening',
      },
      { ledger, customers, drafts: draftRepo },
    );
    const priya = await createIntake(
      {
        customer: { displayName: 'Priya N.', phone: '555-0200', posCustomerRef: 'sq_priya' },
        creditCents: 3000,
        items: [],
        idempotencyKey: 'intake:priya:opening',
      },
      { ledger, customers, drafts: draftRepo },
    );
    console.log(`  • ${marcus.customer.displayName} (${marcus.customer.posCustomerRef}) — opening credit posted`);
    console.log(`  • ${priya.customer.displayName} (${priya.customer.posCustomerRef}) — opening credit posted`);

    // One draft for Marcus, created + pushed only if he has none yet.
    const marcusDrafts = await drafts.list({ sourceCustomerId: marcus.customer.id });
    if (marcusDrafts.length === 0) {
      const stub = await draftRepo.create({
        sourceCustomerId: marcus.customer.id,
        itemType: 'SHOE',
        attributes: { brand: 'Nike', size: '10' },
        priceCents: 6500,
      });
      await drafts.markReady(stub.id);
      const pushed = await drafts.pushToPos(stub.id, pos);
      console.log(`  • draft ${pushed.id} pushed to catalog as ${pushed.posCatalogRef}`);
    } else {
      console.log(`  • Marcus already has ${marcusDrafts.length} draft(s) from a prior run`);
    }

    // ---- Idempotent sales (keyed by event id) -----------------------------
    heading('SALES  (apply store-credit redemptions; idempotent by event id)');
    const sales: SaleEvent[] = [
      {
        eventId: 'evt:pg:marcus:1', orderRef: 'ord_pg_1', customerRef: 'sq_marcus', occurredAt: OCCURRED_AT,
        tenders: [{ type: 'STORE_CREDIT', amountCents: 2000 }],
      },
      {
        // No customer attached — surfaced as unmatched, never posts.
        eventId: 'evt:pg:nocustomer:1', orderRef: 'ord_pg_2', occurredAt: OCCURRED_AT,
        tenders: [{ type: 'OTHER', amountCents: 800, note: 'Store Credit' }],
      },
    ];
    for (const sale of sales) {
      const r = await ledger.applySaleEvent(sale);
      const tag =
        r.status === 'APPLIED'
          ? `applied   redeem ${money(r.creditCents)}`
          : r.status === 'UNMATCHED'
            ? `unmatched ${money(r.creditCents)} (${r.reason})`
            : `ignored   (${r.reason})`;
      console.log(`  ${sale.eventId.padEnd(22)} ${sale.orderRef.padEnd(9)} ${tag}`);
    }

    // ---- Balances after this run ------------------------------------------
    heading('AFTER THIS RUN  (now persisted in Postgres)');
    for (const c of await customers.listCustomers()) {
      const bal = await ledger.getBalance(c.id);
      const flag = bal < 0 ? '  ⚠ negative' : '';
      console.log(`  ${c.displayName.padEnd(10)} ${money(bal).padStart(9)}${flag}`);
    }

    // ---- Reconciliation ----------------------------------------------------
    const report = await reconcileDay(sales, ledgerRepo);
    heading('RECONCILIATION REPORT');
    console.log(`  Applied: ${report.appliedCount}   Ignored: ${report.ignoredCount}`);
    console.log(`  Issued ${money(report.totals.issuedCents)} · Redeemed ${money(report.totals.redeemedCents)} · ` +
      `Outstanding liability ${money(report.totals.outstandingLiabilityCents)}`);
    if (report.unmatched.length > 0) {
      console.log('  Needs attention — unmatched sales:');
      for (const u of report.unmatched) {
        console.log(`    • order ${u.orderRef}  ${money(u.amountCents)}  ${u.reason}`);
      }
    }

    console.log(`\n${RULE}`);
    console.log('  Run `npm run demo:pg` again — the balances above will carry over,');
    console.log('  and nothing will double-post (idempotent intake + sales).');
    console.log(RULE);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
