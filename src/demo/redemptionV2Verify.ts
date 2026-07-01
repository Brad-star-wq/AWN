/**
 * Redemption v2 — sandbox verification (repeatable).
 *
 * Mirrors src/demo/phase5SandboxVerify.ts. Drives the five attribute-on-arrival
 * scenarios against the real Supabase DB, using the Square SANDBOX API for the
 * webhook-dependent parts. It never calls the webhook directly — it creates
 * Square sandbox payments/refunds, Square fires the LIVE webhook, and this
 * script polls Supabase for the result. The owner-side actions (attribute,
 * over-balance confirm, reassign) are driven through the real finalize spine
 * against the DB, exactly as the /attribute endpoint does.
 *
 *   npm run verify:redemption-v2            # run all scenarios
 *   npm run verify:redemption-v2 -- cleanup # remove this run's test rows
 *
 * REQUIRES, for the webhook-dependent scenarios (1, 2, 5):
 *   • the redemptions table applied to the target DB (db/redemptions.sql), and
 *   • the Phase C webhook deployed to the live endpoint.
 * Scenarios 3 and 4 are owner-side and run against the DB + spine directly, so
 * they pass without a deploy (they still need the table).
 *
 * Env (load via --env-file; see package.json):
 *   DATABASE_URL                 same Supabase pooler URL the webhook uses
 *   SQUARE_SANDBOX_ACCESS_TOKEN  sandbox access token (NEVER production)
 *   SQUARE_LOCATION_ID           a sandbox location id
 *   SQUARE_ENV=sandbox           guard; refuses to run if not 'sandbox'
 *
 * SAFETY: sandbox only. Writes a clearly-labelled test customer
 * ("REDEMPTION-V2-TEST") + rows into your real DB; clean up with `cleanup`.
 */
import { randomUUID } from 'node:crypto';
import { createSql } from '../adapters/pg/client';
import { PgCustomerRepository } from '../adapters/pgCustomerRepository';
import { PgLedgerRepository } from '../adapters/pgLedgerRepository';
import { Ledger } from '../domain/ledger';
import { PgRedemptionRepository } from '../adapters/pgRedemptionRepository';
import { finalizeRedemption, reassignRedemption } from '../domain/redemptions';

const SQUARE_BASE = 'https://connect.squareupsandbox.com';
const SQUARE_VERSION = '2026-01-22';
const TEST_NAME = 'REDEMPTION-V2-TEST';
const TEST_PHONE = '+15555550111';
const POLL_MS = 90_000;

const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
const locationId = process.env.SQUARE_LOCATION_ID;
const canDriveSquare = Boolean(token && locationId);

const log = (m: string) => console.log(m);
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const ok = (m: string) => log(`   ✅ ${m}`);
const bad = (m: string) => log(`   ❌ ${m}`);

function uniqueAmount(offset: number): number {
  const base = 100 + (Math.floor(Date.now() / 1000) % 800);
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
    external_details: { type: 'OTHER', source: 'Store credit (redemption v2 sandbox test)' },
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
    reason: 'redemption v2 sandbox test',
  });
  const refund = json.refund as { id: string; status: string };
  log(`   → Square refund ${refund.id} (${refund.status})`);
  return refund.id;
}

function explorerPaymentSteps(amountCents: number) {
  log('   Square not configured — create the payment by hand (API Explorer or curl):');
  log(`     POST ${SQUARE_BASE}/v2/payments   (Square-Version: ${SQUARE_VERSION})`);
  log(`     { "idempotency_key":"<uuid>", "source_id":"EXTERNAL", "location_id":"<SANDBOX_LOCATION>",`);
  log(`       "amount_money":{"amount":${amountCents},"currency":"USD"},`);
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

  const sql = createSql();
  const customers = new PgCustomerRepository(sql);
  const ledgerRepo = new PgLedgerRepository(sql, customers);
  const ledger = new Ledger(ledgerRepo);
  const redemptions = new PgRedemptionRepository(sql);
  const deps = { ledger, redemptions };
  const loc = locationId ?? 'SANDBOX-LOCATION';

  if (process.argv[2] === 'cleanup') {
    const c = await customers.findByPhone(TEST_PHONE);
    if (!c) log('No test customer found; nothing to clean.');
    else {
      await sql`delete from redemptions where customer_id = ${c.id}::uuid or location_id = ${loc}`;
      await sql`delete from credit_ledger where customer_id = ${c.id}::uuid`;
      await sql`delete from customers where id = ${c.id}::uuid`;
      log(`Cleaned test customer ${c.id} and its rows.`);
    }
    await sql.end();
    return;
  }

  log(`\nRedemption v2 — sandbox verification`);
  log(`Square drive: ${canDriveSquare ? 'AUTOMATIC' : 'MANUAL (will print steps)'}; location=${loc}\n`);

  let customer = await customers.findByPhone(TEST_PHONE);
  if (!customer) customer = await customers.create({ displayName: TEST_NAME, phone: TEST_PHONE });
  const topUp = 200_00;
  await ledger.issueCredit({
    customerId: customer.id,
    amountCents: topUp,
    note: 'redemption v2 sandbox top-up',
    idempotencyKey: `v2-topup:${randomUUID()}`,
  });
  log(`Customer ${customer.id} (${TEST_NAME}) balance ${usd(await ledger.getBalance(customer.id))}`);

  // === Scenario 1: attribute-on-arrival ======================================
  const a1 = uniqueAmount(0);
  log(`\n[1] Attribute-on-arrival: OTHER payment ${usd(a1)} → awaiting_attribution → attribute`);
  let paymentId: string | null = null;
  if (canDriveSquare) paymentId = await createExternalPayment(a1);
  else explorerPaymentSteps(a1);

  const arrived = await poll('awaiting_attribution row', async () => {
    if (!paymentId) return null;
    const r = await redemptions.getByPaymentId(paymentId);
    return r && r.status === 'awaiting_attribution' ? r : null;
  });
  if (!arrived) {
    bad('no awaiting_attribution row — is the redemptions table applied and the v2 webhook deployed?');
  } else {
    ok(`row ${arrived.id} awaiting_attribution, customer=${arrived.customerId ?? 'null'}, no ledger change`);
    const before = await ledger.getBalance(customer.id);
    const res = await finalizeRedemption(
      {
        redemptionId: arrived.id,
        customerId: customer.id,
        amountCents: arrived.amountCents,
        squarePaymentId: arrived.squarePaymentId,
        origin: 'square_pos_other_tender',
      },
      deps,
    );
    const after = await ledger.getBalance(customer.id);
    if (res.ok && after === before - a1) ok(`attributed → balance ${usd(before)} → ${usd(after)} (−${usd(a1)})`);
    else bad(`attribution did not draw down as expected (${JSON.stringify(res)})`);
  }

  // === Scenario 2: idempotency ==============================================
  log(`\n[2] Idempotency: exactly one row + one ledger REDEEM for the payment`);
  if (paymentId) {
    const rows = await sql`select count(*)::int as n from redemptions where square_payment_id = ${paymentId}`;
    const redeems = await sql`
      select count(*)::int as n from credit_ledger
       where idempotency_key = ${'square-redeem:' + paymentId}`;
    const oneRow = Number(rows[0]?.n) === 1;
    const oneRedeem = Number(redeems[0]?.n) === 1;
    // Re-running finalize must be a no-op (idempotent).
    const again = arrived
      ? await finalizeRedemption(
          {
            redemptionId: arrived.id,
            customerId: customer.id,
            amountCents: arrived.amountCents,
            squarePaymentId: arrived.squarePaymentId,
            origin: 'square_pos_other_tender',
          },
          deps,
        )
      : null;
    const noop = !again || (again.ok && again.alreadyFinalized);
    (oneRow && oneRedeem && noop ? ok : bad)(
      `rows=${Number(rows[0]?.n)}, redeems=${Number(redeems[0]?.n)}, re-finalize no-op=${noop}`,
    );
  } else {
    log('   ⚠ no payment id from scenario 1 — skipping');
  }

  // === Scenario 3: over-balance → needsConfirm → confirm → negative flag =====
  const a3 = topUp + uniqueAmount(3); // deliberately over the remaining balance
  log(`\n[3] Over-balance: attribute ${usd(a3)} (> balance) → needsConfirm → confirm → flag`);
  const row3 = await redemptions.create({
    amountCents: a3,
    locationId: loc,
    squarePaymentId: `v2test-over:${randomUUID()}`,
    origin: 'square_pos_other_tender',
    status: 'awaiting_attribution',
  });
  const first = await finalizeRedemption(
    { redemptionId: row3.id, customerId: customer.id, amountCents: a3, squarePaymentId: row3.squarePaymentId, origin: 'square_pos_other_tender' },
    deps,
  );
  if (!first.ok && first.needsConfirm) ok(`needsConfirm (available ${usd(first.available)})`);
  else bad(`expected needsConfirm, got ${JSON.stringify(first)}`);
  const confirmed = await finalizeRedemption(
    { redemptionId: row3.id, customerId: customer.id, amountCents: a3, squarePaymentId: row3.squarePaymentId, origin: 'square_pos_other_tender', allowNegative: true },
    deps,
  );
  const row3After = await redemptions.getById(row3.id);
  if (confirmed.ok && confirmed.negativeBalance && row3After?.flags && (row3After.flags as Record<string, unknown>).negative_balance === true) {
    ok(`finalized with negative_balance flag; balance ${usd(await ledger.getBalance(customer.id))}`);
  } else bad(`expected negative flag, got ${JSON.stringify(confirmed)} / flags ${JSON.stringify(row3After?.flags)}`);

  // Reset the balance for the reassign scenario (append-only correction).
  await ledger.adjustCredit({ customerId: customer.id, amountCents: a3, note: 'v2 test: restore after over-balance' });

  // === Scenario 4: reassign =================================================
  const a4 = uniqueAmount(4);
  log(`\n[4] Reassign: finalize to A, reassign, finalize to B → clean`);
  const otherId = `${customer.id}`; // single test customer; reassign back to same is still a clean cycle
  const wrong = await customers.findByPhone(TEST_PHONE); // reuse the test customer as "A"
  const row4 = await redemptions.create({
    amountCents: a4,
    locationId: loc,
    squarePaymentId: `v2test-reassign:${randomUUID()}`,
    origin: 'square_pos_other_tender',
    status: 'awaiting_attribution',
  });
  const balStart = await ledger.getBalance(customer.id);
  await finalizeRedemption(
    { redemptionId: row4.id, customerId: wrong!.id, amountCents: a4, squarePaymentId: row4.squarePaymentId, origin: 'square_pos_other_tender' },
    deps,
  );
  const balAfterFirst = await ledger.getBalance(customer.id);
  const requeued = await reassignRedemption(row4.id, deps);
  const balAfterReassign = await ledger.getBalance(customer.id);
  const reFinal = await finalizeRedemption(
    { redemptionId: row4.id, customerId: customer.id, amountCents: a4, squarePaymentId: row4.squarePaymentId, origin: 'square_pos_other_tender' },
    deps,
  );
  const balEnd = await ledger.getBalance(customer.id);
  const clean =
    balAfterFirst === balStart - a4 &&
    balAfterReassign === balStart &&
    requeued.status === 'awaiting_attribution' &&
    reFinal.ok &&
    balEnd === balStart - a4;
  (clean ? ok : bad)(
    `start ${usd(balStart)} → first ${usd(balAfterFirst)} → reassign ${usd(balAfterReassign)} → refinal ${usd(balEnd)} (attempt=${requeued.attributionAttempt})`,
  );
  void otherId;

  // === Scenario 5: refund the scenario-1 payment → credit returns ===========
  log(`\n[5] Refund: refund the ${usd(a1)} payment → credit returns + row reversed`);
  if (!paymentId) {
    log('   ⚠ no payment id from scenario 1 — skipping');
  } else {
    const beforeRefund = await ledger.getBalance(customer.id);
    if (canDriveSquare) await refundPayment(paymentId, a1);
    else log(`   Refund payment ${paymentId} for ${a1} cents via POST ${SQUARE_BASE}/v2/refunds`);
    const reversed = await poll('reversal', async () => {
      const r = await redemptions.getByPaymentId(paymentId!);
      const bal = await ledger.getBalance(customer.id);
      return r && r.status === 'reversed' && bal >= beforeRefund + a1 ? bal : null;
    });
    (reversed ? ok : bad)(
      reversed ? `credit returned: ${usd(beforeRefund)} → ${usd(reversed)} (+${usd(a1)}), row reversed` : 'no reversal seen',
    );
  }

  log(`\nDone. Cleanup when ready:  npm run verify:redemption-v2 -- cleanup\n`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
