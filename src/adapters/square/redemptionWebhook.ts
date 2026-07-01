import { parsePaymentEvent, parseRefundEvent } from './parseEvent';
import { WebhookEventStore, PendingRedemptionStore } from './pendingRedemptions';
import { AlertStore } from './alerts';
import { RedemptionRepository } from '../../ports/redemptionRepository';
import {
  FinalizeLedger,
  finalizeRedemption,
  reverseRedemptionForRefund,
} from '../../domain/redemptions';

/**
 * Redemption v2 webhook handler — attribute-on-arrival.
 *
 * Replaces the v1 "guess which pending matches" reconciliation for the PRIMARY
 * flow: a COMPLETED OTHER-tender payment now creates an UNATTRIBUTED
 * `redemptions` row (customer_id = null, status = awaiting_attribution) that a
 * human assigns later. The old NO_PENDING alert is no longer an error — it is
 * the normal path.
 *
 * This sits behind the route's signature verify + raw-body read (untouched). It
 * keeps event_id dedupe, and adds a second idempotency guard on the redemption
 * row's UNIQUE(square_payment_id). The v1 matcher/dispatch and their tests are
 * left intact; the route simply calls this instead.
 *
 * The legacy pending_redemptions table survives ONLY as an optional
 * auto-attribution fast path (deps.pendings): if a single clean pending matches
 * a payment, we attribute it automatically. Nothing new is built on it.
 */

/** Tight window for the OPTIONAL auto-attribution fast path (a human is the fallback). */
export const DEFAULT_FAST_PATH_WINDOW_MS = 2 * 60 * 1000;

export interface RedemptionEventDeps {
  redemptions: RedemptionRepository;
  events: WebhookEventStore;
  ledger: FinalizeLedger;
  /** Optional legacy fast path + refund fallback. Omit to disable entirely. */
  pendings?: PendingRedemptionStore;
  alerts?: AlertStore;
  fastPathWindowMs?: number;
}

export type RedemptionEventResult =
  | { kind: 'IGNORED'; reason: string }
  | { kind: 'DUPLICATE_EVENT'; eventId: string }
  | { kind: 'ALREADY_RECORDED'; paymentId: string }
  | { kind: 'AWAITING_ATTRIBUTION'; redemptionId: string }
  | { kind: 'AUTO_ATTRIBUTED'; redemptionId: string; ledgerEntryId: string }
  | { kind: 'REFUND_REVERSED'; redemptionId: string; ledgerEntryId: string }
  | { kind: 'REFUND_NO_REDEMPTION'; refundId: string; paymentId: string };

function eventId(event: Record<string, unknown>): string | null {
  return typeof event.event_id === 'string' ? event.event_id : null;
}

export async function processRedemptionEvent(
  event: Record<string, unknown>,
  deps: RedemptionEventDeps,
): Promise<RedemptionEventResult> {
  const id = eventId(event);
  if (!id) return { kind: 'IGNORED', reason: 'missing-event-id' };
  const type = typeof event.type === 'string' ? event.type : '';

  if (type === 'payment.created' || type === 'payment.updated') {
    return handlePayment(id, event, deps);
  }
  if (type === 'refund.created' || type === 'refund.updated') {
    return handleRefund(id, event, deps);
  }
  return { kind: 'IGNORED', reason: `unhandled-type:${type}` };
}

async function handlePayment(
  eventKey: string,
  event: Record<string, unknown>,
  deps: RedemptionEventDeps,
): Promise<RedemptionEventResult> {
  const signal = parsePaymentEvent(event);
  // Not a COMPLETED OTHER-tender payment (early created event, card sale, …).
  // Do NOT mark processed, so the later COMPLETED event still gets its chance.
  if (!signal) return { kind: 'IGNORED', reason: 'not-a-completed-other-payment' };

  if (await deps.events.hasProcessed(eventKey)) {
    return { kind: 'DUPLICATE_EVENT', eventId: eventKey };
  }

  // Second idempotency guard: a redemption already exists for this payment.
  const existing = await deps.redemptions.getByPaymentId(signal.paymentId);
  if (existing) {
    await deps.events.markProcessed(eventKey);
    return { kind: 'ALREADY_RECORDED', paymentId: signal.paymentId };
  }

  // Optional fast path: a single clean legacy pending → auto-attribute.
  const auto = await tryAutoAttribute(signal, deps);
  if (auto) {
    await deps.events.markProcessed(eventKey);
    return auto;
  }

  // Primary path: an unattributed redemption awaiting a human.
  const row = await deps.redemptions.create({
    amountCents: signal.amountCents,
    locationId: signal.locationId,
    squarePaymentId: signal.paymentId,
    origin: 'square_pos_other_tender',
    status: 'awaiting_attribution',
  });
  await deps.events.markProcessed(eventKey);
  return { kind: 'AWAITING_ATTRIBUTION', redemptionId: row.id };
}

/**
 * Optional auto-attribution: if exactly one open legacy pending matches on
 * amount + location within a tight window, create the redemption already
 * pointing at that customer and finalize it. Ambiguity (>1) or no match falls
 * through to the human queue — we never guess. Returns null when the fast path
 * does not apply.
 */
async function tryAutoAttribute(
  signal: { paymentId: string; amountCents: number; locationId: string; occurredAt: string },
  deps: RedemptionEventDeps,
): Promise<RedemptionEventResult | null> {
  if (!deps.pendings) return null;
  const windowMs = deps.fastPathWindowMs ?? DEFAULT_FAST_PATH_WINDOW_MS;
  const at = Date.parse(signal.occurredAt);
  const open = await deps.pendings.listOpen();
  const candidates = open.filter(
    (p) =>
      p.amountCents === signal.amountCents &&
      p.locationId === signal.locationId &&
      Math.abs(Date.parse(p.createdAt) - at) <= windowMs,
  );
  if (candidates.length !== 1) return null; // no unique clean match → human queue
  const pending = candidates[0]!;

  const row = await deps.redemptions.create({
    customerId: pending.customerId,
    amountCents: signal.amountCents,
    locationId: signal.locationId,
    squarePaymentId: signal.paymentId,
    origin: 'square_pos_other_tender',
    status: 'awaiting_attribution',
  });

  // The pending was already capped at available credit on creation, so this
  // should not need confirmation. If it somehow would go negative, leave the
  // row awaiting a human (with the suggested customer) rather than auto-forcing.
  const res = await finalizeRedemption(
    {
      redemptionId: row.id,
      customerId: pending.customerId,
      amountCents: signal.amountCents,
      squarePaymentId: signal.paymentId,
      origin: 'square_pos_other_tender',
      allowNegative: false,
    },
    { ledger: deps.ledger, redemptions: deps.redemptions },
  );
  if (!res.ok) return { kind: 'AWAITING_ATTRIBUTION', redemptionId: row.id };

  await deps.pendings.markReconciled(pending.id, {
    paymentId: signal.paymentId,
    reconciledAt: signal.occurredAt,
    ledgerEntryId: res.ledgerEntryId,
  });
  return { kind: 'AUTO_ATTRIBUTED', redemptionId: row.id, ledgerEntryId: res.ledgerEntryId };
}

async function handleRefund(
  eventKey: string,
  event: Record<string, unknown>,
  deps: RedemptionEventDeps,
): Promise<RedemptionEventResult> {
  const signal = parseRefundEvent(event);
  // Only COMPLETED refunds act. A refund that goes PENDING → FAILED never
  // reaches COMPLETED, so credit is never returned for a failed refund.
  if (!signal) return { kind: 'IGNORED', reason: 'not-a-completed-refund' };

  if (await deps.events.hasProcessed(eventKey)) {
    return { kind: 'DUPLICATE_EVENT', eventId: eventKey };
  }

  // Find the redemption tied to the refunded payment (v2 rows first).
  const redemption = await deps.redemptions.getByPaymentId(signal.paymentId);
  if (redemption && redemption.customerId && redemption.status !== 'reversed') {
    const entry = await reverseRedemptionForRefund(
      {
        redemption,
        refundAmountCents: signal.amountCents,
        refundIdempotencyKey: `square-refund:${signal.refundId}`,
        note: `Refund of Square payment ${signal.paymentId} — credit returned`,
      },
      { ledger: deps.ledger, redemptions: deps.redemptions },
    );
    await deps.events.markProcessed(eventKey);
    return { kind: 'REFUND_REVERSED', redemptionId: redemption.id, ledgerEntryId: entry.id };
  }

  // Fallback: a redemption reconciled under the legacy v1 path (pending_redemptions).
  if (deps.pendings) {
    const pending = await deps.pendings.findByReconciledPaymentId(signal.paymentId);
    if (pending) {
      const entry = await deps.ledger.reverse({
        customerId: pending.customerId,
        amountCents: signal.amountCents,
        idempotencyKey: `square-refund:${signal.refundId}`,
        sourceRef: signal.refundId,
        note: `Refund of Square payment ${signal.paymentId} — credit returned (legacy)`,
      });
      await deps.events.markProcessed(eventKey);
      return { kind: 'REFUND_REVERSED', redemptionId: pending.id, ledgerEntryId: entry.id };
    }
  }

  // No redemption for this payment — surface, never blindly credit.
  if (deps.alerts) {
    await deps.alerts.record({
      kind: 'REFUND_NO_REDEMPTION',
      refundId: signal.refundId,
      paymentId: signal.paymentId,
      amountCents: signal.amountCents,
    });
  }
  await deps.events.markProcessed(eventKey);
  return { kind: 'REFUND_NO_REDEMPTION', refundId: signal.refundId, paymentId: signal.paymentId };
}
