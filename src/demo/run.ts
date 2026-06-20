/**
 * End-to-end demo: `npm run demo`.
 *
 * Wires the whole engine together with the in-memory stores and the mock POS,
 * then walks the real flow:
 *   1. intake a few customers (issue store credit + create draft stubs)
 *   2. complete and push a draft into the (mock) POS catalog
 *   3. pull a realistic day of sales from the mock adapter and apply each
 *      through the engine (store-credit tenders, a card-only sale, a sale with
 *      no customer, an unknown customer, a duplicate event id, and an
 *      over-redemption)
 *   4. print every customer's balance and the full reconciliation report.
 *
 * Everything is deterministic — no wall-clock, no randomness — so the output
 * is the same every run.
 */

import { Ledger } from '../domain/ledger';
import { createIntake } from '../domain/intake';
import { Drafts } from '../domain/drafts';
import { reconcileDay } from '../domain/reconciliation';
import { InMemoryCustomerRepository } from '../adapters/inMemoryCustomerRepository';
import { InMemoryLedgerRepository } from '../adapters/inMemoryLedgerRepository';
import { InMemoryDraftRepository } from '../adapters/inMemoryDraftRepository';
import { MockPosAdapter, MockOrderPayload } from '../adapters/mockPosAdapter';
import { buildRealisticDay } from '../adapters/mockScenario';
import { ApplyResult } from '../domain/ledger';
import { SaleEvent } from '../domain/types';
import { RULE, money, heading } from './format';

async function main(): Promise<void> {
  // ---- wiring: one shared customer store across ledger + intake -----------
  const customers = new InMemoryCustomerRepository();
  const ledgerRepo = new InMemoryLedgerRepository(customers);
  const ledger = new Ledger(ledgerRepo);
  const draftRepo = new InMemoryDraftRepository();
  const drafts = new Drafts(draftRepo);
  const pos = new MockPosAdapter();

  console.log(RULE);
  console.log('  RESALE ENGINE — END-TO-END DEMO');
  console.log(RULE);

  // ---- 1. Intake ----------------------------------------------------------
  heading('INTAKE  (issue store credit + create draft stubs)');

  const marcus = await createIntake(
    {
      customer: { displayName: 'Marcus T.', phone: '555-0100', posCustomerRef: 'sq_marcus' },
      creditCents: 5000,
      items: [
        { itemType: 'SHOE', attributes: { brand: 'Nike' } },
        { itemType: 'CARD' },
      ],
      idempotencyKey: 'intake_marcus_1',
    },
    { ledger, customers, drafts: draftRepo },
  );

  const priya = await createIntake(
    {
      customer: { displayName: 'Priya N.', phone: '555-0200', posCustomerRef: 'sq_priya' },
      creditCents: 3000,
      items: [{ itemType: 'OTHER', attributes: { kind: 'jacket' } }],
      idempotencyKey: 'intake_priya_1',
    },
    { ledger, customers, drafts: draftRepo },
  );

  const dana = await createIntake(
    {
      customer: { displayName: 'Dana K.', phone: '555-0300', posCustomerRef: 'sq_dana' },
      creditCents: 1000,
      items: [{ itemType: 'SHOE' }],
      idempotencyKey: 'intake_dana_1',
    },
    { ledger, customers, drafts: draftRepo },
  );

  for (const r of [marcus, priya, dana]) {
    console.log(
      `  • ${r.customer.displayName.padEnd(10)} (${r.customer.posCustomerRef})  ` +
        `issued ${money(r.creditEntry.deltaCents)} credit, ${r.drafts.length} draft(s)`,
    );
  }

  // ---- 2. Complete + push a draft ----------------------------------------
  heading('DRAFTS  (finish one item and push it to the POS catalog)');

  const shoe = marcus.drafts[0]!;
  await drafts.edit(shoe.id, { attributes: { size: '10', color: 'red' }, priceCents: 6500 });
  await drafts.markReady(shoe.id);
  const pushed = await drafts.pushToPos(shoe.id, pos);
  console.log(
    `  • ${pushed.itemType} draft ${pushed.id}  ${money(pushed.priceCents ?? 0)}  ` +
      `${shoe.status} → READY → ${pushed.status} (catalog ref ${pushed.posCatalogRef})`,
  );

  // ---- 3. A realistic day of mock sales ----------------------------------
  heading('MOCK POS  (pull the day via fetchSalesSince, apply each sale)');

  // The scripted day + one over-redemption to exercise the negative-balance path.
  const danaOverRedeem: MockOrderPayload = {
    id: 'evt_dana_over',
    order_id: 'ord_1006',
    customer_id: 'sq_dana',
    created_at: '2026-06-18T16:30:00.000-04:00',
    tenders: [{ method: 'store_credit', amount_cents: 1500 }], // exceeds Dana's $10 → negative
  };
  pos.seedOrders([...buildRealisticDay().orders, danaOverRedeem]);

  const sales = await pos.fetchSalesSince('2000-01-01T00:00:00.000Z');

  for (const sale of sales) {
    const result = await ledger.applySaleEvent(sale);
    console.log(`  ${await describeOutcome(sale, result, customers)}`);
  }

  // ---- 4. Balances --------------------------------------------------------
  heading('BALANCES');
  for (const c of await customers.listCustomers()) {
    const bal = await ledger.getBalance(c.id);
    const flag = bal < 0 ? '   ⚠ negative (over-redeemed)' : '';
    console.log(`  ${c.displayName.padEnd(10)} ${money(bal).padStart(9)}${flag}`);
  }

  // ---- 5. Reconciliation report ------------------------------------------
  const report = await reconcileDay(sales, ledgerRepo);

  heading('RECONCILIATION REPORT  (2026-06-18)');
  console.log(`  Applied redemptions: ${report.appliedCount}`);
  console.log(`  Ignored (no store credit): ${report.ignoredCount}`);
  console.log('  Totals:');
  console.log(`    Issued:                ${money(report.totals.issuedCents).padStart(10)}`);
  console.log(`    Redeemed:              ${money(report.totals.redeemedCents).padStart(10)}`);
  console.log(
    `    Outstanding liability: ${money(report.totals.outstandingLiabilityCents).padStart(10)}` +
      '   (sum of positive balances)',
  );

  console.log('\n  NEEDS ATTENTION');
  if (report.unmatched.length === 0 && report.negativeBalances.length === 0) {
    console.log('    (nothing — the books agree)');
  }
  if (report.unmatched.length > 0) {
    console.log(`    Unmatched sales (${report.unmatched.length}) — surfaced, never dropped:`);
    for (const u of report.unmatched) {
      console.log(`      • order ${u.orderRef}  ${money(u.amountCents).padStart(8)}  ${u.reason}`);
    }
  }
  if (report.negativeBalances.length > 0) {
    console.log(`    Negative balances (${report.negativeBalances.length}) — over-redemptions to chase:`);
    for (const n of report.negativeBalances) {
      console.log(`      • ${n.displayName.padEnd(10)} ${money(n.balanceCents).padStart(8)}`);
    }
  }

  console.log(`\n${RULE}`);
  console.log(`  Mock POS catalog now holds ${pos.catalogItems().length} pushed item(s).`);
  console.log(RULE);
}

/** Render one applied sale as an aligned, readable line. */
async function describeOutcome(
  sale: SaleEvent,
  result: ApplyResult,
  customers: InMemoryCustomerRepository,
): Promise<string> {
  const ref = `${sale.eventId.padEnd(20)} ${sale.orderRef.padEnd(9)}`;
  switch (result.status) {
    case 'APPLIED': {
      const customer = await customers.getCustomer(result.customerId);
      const name = customer?.displayName ?? result.customerId;
      return `applied    ${ref} redeem ${money(result.creditCents).padStart(8)} → ${name}`;
    }
    case 'IGNORED':
      return `ignored    ${ref} (${result.reason})`;
    case 'UNMATCHED':
      return `unmatched  ${ref} ${money(result.creditCents).padStart(8)}  ${result.reason}`;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
