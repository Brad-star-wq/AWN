/**
 * stage:redemption — fire ONE sandbox Square OTHER-tender payment so that exactly
 * one "awaiting attribution" redemption lands in the app's queue to assign live.
 * For demos + manual testing.
 *
 * Distinct from `verify:redemption-v2`: that script runs all five scenarios AND
 * cleans up after itself. This one does a SINGLE thing — create the payment and
 * exit. NO attribution, NO cleanup, NO other scenarios — it deliberately leaves
 * one pending redemption sitting in the queue for you to assign by hand.
 *
 * The deployed webhook is what turns this COMPLETED EXTERNAL/OTHER payment into an
 * awaiting_attribution `redemptions` row. This script does not touch the engine,
 * finalizeRedemption, or the webhook — it only asks Square to create the payment;
 * Square then fires the live webhook.
 *
 *   npm run stage:redemption            # default $40.00 (4000 cents)
 *   npm run stage:redemption -- 2500    # $25.00 (amount in cents)
 *   STAGE_AMOUNT_CENTS=1500 npm run stage:redemption
 *
 * Env (loaded via --env-file; see package.json):
 *   SQUARE_SANDBOX_ACCESS_TOKEN  sandbox token (reused via squareClientFromEnv)
 *   SQUARE_ENV                   must NOT be 'production' — refuses, for safety
 *   SQUARE_LOCATION_ID           optional; defaults to the demo sandbox location
 */
import { randomUUID } from 'node:crypto';
import { squareClientFromEnv } from '../adapters/square/squareClient';

const DEFAULT_LOCATION_ID = 'L8FFWFB3W9Y2Q';
const DEFAULT_AMOUNT_CENTS = 4000;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Amount in integer cents from CLI arg or STAGE_AMOUNT_CENTS, else the default. */
function resolveAmountCents(): number {
  const raw = process.argv[2] ?? process.env.STAGE_AMOUNT_CENTS;
  if (raw === undefined || raw === '') return DEFAULT_AMOUNT_CENTS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Amount must be a positive integer number of cents; got "${raw}".`);
  }
  return n;
}

async function main() {
  // Safety: this stages a *sandbox* demo redemption. Never against production.
  if (process.env.SQUARE_ENV === 'production') {
    throw new Error("Refusing to run: SQUARE_ENV=production. stage:redemption is sandbox-only.");
  }

  const amountCents = resolveAmountCents();
  const locationId = process.env.SQUARE_LOCATION_ID ?? DEFAULT_LOCATION_ID;
  // Reuses the existing sandbox Square client + SQUARE_SANDBOX_ACCESS_TOKEN;
  // defaults to the sandbox base (production is already refused above).
  const client = squareClientFromEnv();

  console.log(
    `\nStaging one sandbox OTHER-tender payment for ${usd(amountCents)} (${amountCents} cents) at location ${locationId}…`,
  );

  const res = (await client.post('/v2/payments', {
    idempotency_key: randomUUID(),
    source_id: 'EXTERNAL',
    amount_money: { amount: amountCents, currency: 'USD' },
    location_id: locationId,
    external_details: { type: 'OTHER', source: 'Store credit demo' },
  })) as { payment?: { id?: string; status?: string } };

  const payment = res.payment;
  if (!payment?.id) {
    throw new Error(`Square did not return a payment id: ${JSON.stringify(res)}`);
  }

  console.log(`\n✅ Created sandbox payment`);
  console.log(`   payment id : ${payment.id}`);
  console.log(`   amount     : ${usd(amountCents)} (${amountCents} cents)`);
  console.log(`   status     : ${payment.status ?? '(unknown)'}`);
  console.log(`   location   : ${locationId}`);
  console.log(
    `\nThe live webhook will create one awaiting_attribution redemption to assign in the app.`,
  );
  console.log(`(No attribution, no cleanup — left in the queue on purpose.)\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
