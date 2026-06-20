/**
 * Phase 5 — Part 6 sandbox verification (repeatable).
 *
 * Drives the four reconciliation scenarios against the LIVE Netlify webhook and
 * the real Supabase DB, using the Square SANDBOX API. It never calls the
 * webhook directly — it creates Square sandbox payments/refunds, Square fires
 * the webhook to Netlify, and this script polls Supabase for the result. That
 * proves the real end-to-end path, signature and all.
 *
 *   npm run verify:phase5            # run all scenarios
 *   npm run verify:phase5 -- cleanup # remove this run's test rows
 *
 * Env (load via --env-file; see package.json):
 *   DATABASE_URL                 same Supabase pooler URL the Netlify fn uses
 *   SQUARE_SANDBOX_ACCESS_TOKEN  sandbox access token (NEVER production)
 *   SQUARE_LOCATION_ID           a sandbox location id
 *   SQUARE_ENV=sandbox           guard; refuses to run if not 'sandbox'
 *
 * If the Square token/location are absent, it still seeds and polls, and prints
 * the exact API Explorer request to run by hand for each scenario.
 *
 * SAFETY: sandbox only. It writes a clearly-labelled test customer
 * ("PHASE5-SANDBOX-TEST") and ledger rows into your real DB; clean them up with
 * the `cleanup` subcommand or the SQL printed at the end.
 */
import { randomUUID } from 'node:crypto';
import { createSql } from '../adapters/pg/client';
import { PgCustomerRepository } from '../adapters/pgCustomerRepository';
import { PgLedgerRepository } from '../adapters/pgLedgerRepository';
import { Ledger } from '../domain/ledger';
import {
  PgPendingRedemptionStore,
  PgAlertStore,
} from '../adapters/square/pgStores';
import { createPendingRedemption } from '../adapters/square/createPendingRedemption';
import { findStalePendings } from '../adapters/square/matcher';

const SQUARE_BASE = 'https://connect.squareupsandbox.com';
const SQUARE_VERSION = '2026-01-22';
const TEST_NAME = 'PHASE5-SANDBOX-TEST';
const TEST_PHONE = '+15555550100'; // sentinel; reused across runs
const POLL_MS = 90_000;

const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
const locationId = process.env.SQUARE_LOCATION_ID;
const canDriveSquare = Boolean(token && locationId);

function log(msg: string) {
  console.log(msg);
}
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** A distinctive amount per run so the match is unambiguous (no other pending shares it). */
function uniqueAmount(offset: number): number {
  const base = 100 + (Math.floor(Date.now() / 1000) % 800); // 100..899 cents
  return base + offset;
}

async function squareFetch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Square ${path} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function createExternalPayment(amountCents: number): Promise<string> {
  const json = await squareFetch('/v2/payments', {
    idempotency_key: randomUUID(),
    source_id: 'EXTERNAL',
    amount_money: { amount: amountCents, currency: 'USD' },
    location_id: locationId,
    external_details: { type: 'OTHER', source: 'Store credit (Phase 5 sandbox test)' },
  });
  const payment = json.payment as { id: string; status: string };
  log(`   → Square payment ${payment.id} (${payment.status})`);
  return payment.id;
}

async function refundPayment(paymentId: string, amountCents: number): Promise<string> {
  const json = await squareFetch('/v2/refunds', {
    idempotency_key: randomUUID(),
    payment_id: paymentId,
    amount_money: { amount: amountCents, currency: 'USD' },
    reason: 'Phase 5 sandbox test',
  });
  const refund = json.refund as { id: string; status: string };
  log(`   → Square refund ${refund.id} (${refund.status})`);
  return refund.id;
}

function explorerPaymentSteps(amountCents: number) {
  log('   Square not configured — create the payment by hand (API Explorer or curl):');
  log(`     POST ${SQUARE_BASE}/v2/payments   (Square-Version: ${SQUARE_VERSION})`);
  log(
    `     { "idempotency_key":"<uuid>", "source_id":"EXTERNAL", "location_id":"<SANDBOX_LOCATION>",`,
  );
  log(
    `       "amount_money":{"amount":${amountCents},"currency":"USD"},`,
  );
  log(`       "external_details":{"type":"OTHER","source":"Store credit"} }`);
}

async function poll<T>(label: string, fn: () => Promise<T | null>): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < POLL_MS) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 3000));
  }
  log(`   ⏱  timed out waiting for ${label} (${POLL_MS / 1000}s)`);
  return null;
}

async function main() {
  if (process.env.SQUARE_ENV && process.env.SQUARE_ENV !== 'sandbox') {
    throw new Error(`Refusing to run: SQUARE_ENV=${process.env.SQUARE_ENV} (must be 'sandbox')`);
  }
  if (!locationId && canDriveSquare) throw new Error('SQUARE_LOCATION_ID required');

  const sql = createSql();
  const customers = new PgCustomerRepository(sql);
  const ledgerRepo = new PgLedgerRepository(sql, customers);
  const ledger = new Ledger(ledgerRepo);
  const pendings = new PgPendingRedemptionStore(sql);
  const alerts = new PgAlertStore(sql);
  const loc = locationId ?? 'SANDBOX-LOCATION';

  if (process.argv[2] === 'cleanup') {
    const c = await customers.findByPhone(TEST_PHONE);
    if (!c) log('No test customer found; nothing to clean.');
    else {
      await sql`delete from reconciliation_alerts where location_id = ${loc} or payment_id is not null and pending_id in (select id from pending_redemptions where customer_id = ${c.id}::uuid)`;
      await sql`delete from pending_redemptions where customer_id = ${c.id}::uuid`;
      await sql`delete from credit_ledger where customer_id = ${c.id}::uuid`;
      await sql`delete from customers where id = ${c.id}::uuid`;
      log(`Cleaned test customer ${c.id} and its rows.`);
    }
    await sql.end();
    return;
  }

  log(`\nPhase 5 — Part 6 sandbox verification`);
  log(`Square drive: ${canDriveSquare ? 'AUTOMATIC' : 'MANUAL (will print steps)'}; location=${loc}\n`);

  // --- Test customer with a balance -----------------------------------------
  let customer = await customers.findByPhone(TEST_PHONE);
  if (!customer) customer = await customers.create({ displayName: TEST_NAME, phone: TEST_PHONE });
  const a1 = uniqueAmount(0);
  const a2 = uniqueAmount(1);
  const topUp = (a1 + a2) * 3;
  await ledger.issueCredit({
    customerId: customer.id,
    amountCents: topUp,
    note: 'Phase 5 sandbox top-up',
    idempotencyKey: `phase5-topup:${randomUUID()}`,
  });
  log(`Customer ${customer.id} (${TEST_NAME}) balance now ${usd(await ledger.getBalance(customer.id))}`);

  // === Scenario 1: happy path — pending + OTHER payment → reconcile ==========
  log(`\n[1] Reconcile: pending ${usd(a1)} + a Square OTHER payment ${usd(a1)}`);
  const before1 = await ledger.getBalance(customer.id);
  const pending1 = await createPendingRedemption(
    { customerId: customer.id, amountCents: a1, locationId: loc, createdAt: new Date().toISOString() },
    { balances: ledger, pendings },
  );
  log(`   pending ${pending1.id} created (PENDING)`);
  let paymentId: string | null = null;
  if (canDriveSquare) paymentId = await createExternalPayment(a1);
  else explorerPaymentSteps(a1);

  const reconciled = await poll('reconciliation', async () => {
    const p = await pendings.get(pending1.id);
    return p && p.status === 'RECONCILED' ? p : null;
  });
  if (reconciled) {
    paymentId = paymentId ?? reconciled.reconciledPaymentId ?? null;
    const after = await ledger.getBalance(customer.id);
    log(`   ✅ pending RECONCILED → payment ${reconciled.reconciledPaymentId}`);
    log(`   ✅ ledger entry ${reconciled.ledgerEntryId}; balance ${usd(before1)} → ${usd(after)} (−${usd(a1)})`);
  } else {
    log(`   ❌ not reconciled — check Netlify function logs and the webhook subscription`);
  }

  // === Scenario 2: OTHER payment with no pending → NO_PENDING alert ==========
  log(`\n[2] NO_PENDING: a Square OTHER payment ${usd(a2)} with no matching pending`);
  if (canDriveSquare) await createExternalPayment(a2);
  else explorerPaymentSteps(a2);
  const noPending = await poll('NO_PENDING alert', async () => {
    const open = await alerts.listOpen();
    return open.find((al) => al.kind === 'NO_PENDING' && al.amountCents === a2) ?? null;
  });
  log(noPending ? `   ✅ NO_PENDING alert ${noPending.id} for ${usd(a2)}` : `   ❌ no NO_PENDING alert seen`);

  // === Scenario 3: pending with no payment → stale ==========================
  log(`\n[3] STALE: a pending created 20 min ago with no payment`);
  const stalePending = await createPendingRedemption(
    {
      customerId: customer.id,
      amountCents: uniqueAmount(2),
      locationId: loc,
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
    { balances: ledger, pendings },
  );
  const stale = await findStalePendings(pendings, new Date().toISOString());
  const found = stale.find((p) => p.id === stalePending.id);
  if (found) {
    await alerts.record({
      kind: 'STALE_PENDING',
      amountCents: found.amountCents,
      locationId: found.locationId,
      pendingId: found.id,
    });
    log(`   ✅ stale pending ${found.id} surfaced and STALE_PENDING alert recorded`);
  } else {
    log(`   ❌ stale sweep did not surface the pending`);
  }

  // === Scenario 4: refund the scenario-1 payment → credit returns ===========
  log(`\n[4] REFUND: refund the ${usd(a1)} payment → credit returns`);
  if (!paymentId) {
    log(`   ⚠ no payment id from scenario 1 — skipping (refund it manually and re-check the balance)`);
  } else {
    const beforeRefund = await ledger.getBalance(customer.id);
    if (canDriveSquare) await refundPayment(paymentId, a1);
    else log(`   Refund payment ${paymentId} for ${a1} cents via POST ${SQUARE_BASE}/v2/refunds`);
    const reversed = await poll('reversal', async () => {
      const bal = await ledger.getBalance(customer.id);
      return bal >= beforeRefund + a1 ? bal : null;
    });
    log(
      reversed
        ? `   ✅ credit returned: balance ${usd(beforeRefund)} → ${usd(reversed)} (+${usd(a1)})`
        : `   ❌ no reversal seen`,
    );
  }

  log(`\nDone. Cleanup when ready:  npm run verify:phase5 -- cleanup`);
  log(`(or by SQL: delete rows for customer phone ${TEST_PHONE} across`);
  log(` reconciliation_alerts, pending_redemptions, credit_ledger, customers.)\n`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
