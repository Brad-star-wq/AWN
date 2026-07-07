import { NextRequest, NextResponse } from 'next/server';
import { verifySquareWebhookSignature } from '@engine/adapters/square/webhookSignature';
import { processRedemptionEvent } from '@engine/adapters/square/redemptionWebhook';
import {
  PgPendingRedemptionStore,
  PgWebhookEventStore,
  PgAlertStore,
} from '@engine/adapters/square/pgStores';
import { engine } from '@/lib/server/engine';

/**
 * Square webhook endpoint (Phase 5, Part 5).
 *
 * Pinned to the Node.js runtime: this route uses `node:crypto`
 * (HMAC-SHA256 signature verification) and the `postgres`-backed stores —
 * neither works on the Edge runtime. The pin makes that explicit so the route
 * can never be accidentally bundled for Edge.
 *
 * `force-dynamic` because every webhook delivery must be processed live; there
 * is nothing to cache or statically render.
 *
 * Flow: fail-closed signature verify → parse → v2 attribute-on-arrival handler
 * inline → fast 2xx. A COMPLETED OTHER-tender payment creates an unattributed
 * `redemptions` row (a human assigns it later); refunds reverse the linked row.
 * Processing is idempotent (DB unique on event_id, unique on square_payment_id,
 * ledger unique on the payment/refund id), so it is safe to run inline before
 * acking; a 5xx only escapes on a real (transient) failure, which Square retries.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // PROOF-OF-LIFE marker: this string exists ONLY in the v2 route source. If it
  // appears in the deployed logs, `processRedemptionEvent` (attribute-on-arrival)
  // is what answers /api/square/webhook. If logs still show `PAYMENT:NO_PENDING`
  // with NO line below, an older v1 build is being served. First statement in the
  // handler so it fires before signature verify / parse / any early return.
  console.log('[v2-webhook-alive] handler=processRedemptionEvent route=apps/web/app/api/square/webhook');

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;

  // Refuse to accept events we cannot verify, rather than trusting them.
  if (!signatureKey || !notificationUrl) {
    console.error(
      '[square-webhook] missing SQUARE_WEBHOOK_SIGNATURE_KEY / SQUARE_WEBHOOK_NOTIFICATION_URL',
    );
    return new NextResponse('Webhook not configured', { status: 500 });
  }

  // Read the RAW body bytes BEFORE any JSON parsing. The signature is computed
  // over these exact bytes; parsing and re-serializing would change them
  // (key order, spacing) and break verification — the trap called out in the
  // connector walkthrough.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-square-hmacsha256-signature');

  if (
    !verifySquareWebhookSignature({ signatureKey, notificationUrl, rawBody, signatureHeader })
  ) {
    return new NextResponse('Invalid signature', { status: 403 });
  }

  // Signature verified — parse only now.
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Malformed JSON', { status: 400 });
  }

  // TEMPORARY DIAGNOSTIC (OTHER-tender missing-row triage): dump the full raw
  // Square envelope, unredacted, so we can see the real payload shape a sandbox
  // OTHER-tender payment arrives with. Pair with the [parse][diag] lines to see
  // exactly where parsePaymentEvent classifies it IGNORED. Remove once resolved.
  console.log(`[square-webhook][diag] raw ${event.type ?? '(no type)'} ${event.event_id ?? ''}: ${rawBody}`);

  // v2 attribute-on-arrival, against the pg-backed stores, sharing the engine's
  // pooler connection. Idempotent, so running inline is safe; a thrown error
  // becomes a 5xx and Square retries. The legacy pending store is passed only as
  // the OPTIONAL auto-attribution fast path + refund fallback (flagged for
  // retirement) — nothing new is built on it.
  try {
    const result = await processRedemptionEvent(event, {
      redemptions: engine.redemptions,
      events: new PgWebhookEventStore(engine.sql),
      ledger: engine.ledger,
      pendings: new PgPendingRedemptionStore(engine.sql),
      alerts: new PgAlertStore(engine.sql),
    });
    const summary =
      result.kind === 'IGNORED' ? `IGNORED(${result.reason})` : result.kind;
    console.log(`[square-webhook] ${event.type ?? '(no type)'} ${event.event_id ?? ''} → ${summary}`);
  } catch (err) {
    console.error('[square-webhook] processing failed', err);
    return new NextResponse('Processing error', { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
