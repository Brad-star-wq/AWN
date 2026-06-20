import { NextRequest, NextResponse } from 'next/server';
import { verifySquareWebhookSignature } from '@engine/adapters/square/webhookSignature';

/**
 * Square webhook endpoint (Phase 5, Part 5).
 *
 * Pinned to the Node.js runtime: this route uses `node:crypto`
 * (HMAC-SHA256 signature verification) and will reach the `postgres`-backed
 * stores once they land — neither works on the Edge runtime. The pin makes
 * that explicit so the route can never be accidentally bundled for Edge.
 *
 * `force-dynamic` because every webhook delivery must be processed live; there
 * is nothing to cache or statically render.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
  let event: { event_id?: string; type?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Malformed JSON', { status: 400 });
  }

  // Fast-ack, then process asynchronously (Square expects a quick 2xx and will
  // retry otherwise). The async work — dedupe by event_id, then
  // reconcilePayment / reverseRefund against the pg-backed pending + event
  // stores, fetching the Square payment/tender via the adapter — wires in here
  // once those pieces land in the sandbox step.
  // TODO(phase5-sandbox): dispatch to the matcher off the request path.
  console.log(
    `[square-webhook] verified event ${event.event_id ?? '(no id)'} type=${event.type ?? '(none)'}`,
  );

  return NextResponse.json({ received: true }, { status: 200 });
}
