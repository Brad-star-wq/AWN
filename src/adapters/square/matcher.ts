import { LedgerEntry } from '../../domain/types';
import {
  PendingRedemption,
  PendingRedemptionStore,
  WebhookEventStore,
} from './pendingRedemptions';

/**
 * The reconciliation matcher — the make-or-break of Phase 5.
 *
 * A store-credit redemption rung on Square arrives as a COMPLETED payment with
 * an `OTHER` tender, carrying **no customer identity** (a POS note doesn't ride
 * through the webhook, and `OTHER` isn't a unique signal). So we never infer
 * *who* from Square. Instead we match the payment to an app-created pending
 * redemption on the only signals both sides share:
 *
 *   amount (integer cents) + location + a short time window.
 *
 * On a unique match we finalize the negative ledger entry through the engine's
 * existing `redeemCredit` (idempotent on the Square payment id). Two pendings
 * with the same amount in the same window is an **ambiguity we refuse to
 * guess** — it surfaces for a human. A payment with no pending, and a pending
 * with no payment, are the two silent failure modes the model exists to make
 * loud.
 */

/** ±10 minutes: the match window between app intent and Square ring. */
export const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/**
 * The reconciliation-relevant facts pulled from a Square OTHER-tender payment.
 * The adapter produces this from the webhook payload / a payment fetch; the
 * matcher never sees a Square type.
 */
export interface RedemptionSignal {
  /** Square payment id — the idempotency anchor for the finalized entry. */
  paymentId: string;
  amountCents: number;
  locationId: string;
  /** When Square completed the payment (ISO). */
  occurredAt: string;
}

/**
 * The minimal engine surface the matcher needs. `Ledger` satisfies this
 * structurally — the matcher depends on the behavior, not the class.
 */
export interface RedemptionFinalizer {
  redeemCredit(args: {
    customerId: string;
    amountCents: number;
    sourceRef?: string;
    idempotencyKey?: string;
    enforceBalance?: boolean;
    note?: string;
  }): Promise<LedgerEntry>;
}

/** The minimal ledger surface the refund path needs. `Ledger` satisfies it. */
export interface RefundReverser {
  reverse(args: {
    customerId: string;
    amountCents: number;
    sourceRef?: string;
    idempotencyKey?: string;
    note?: string;
  }): Promise<LedgerEntry>;
}

export type MatchOutcome =
  /** Square retried an event we already handled — no-op. */
  | { kind: 'DUPLICATE'; eventId: string }
  /** Unique match: ledger finalized, pending reconciled. */
  | { kind: 'RECONCILED'; pending: PendingRedemption; ledgerEntry: LedgerEntry }
  /** Failure mode: a store-credit sale on Square with no app redemption — who? */
  | { kind: 'NO_PENDING'; signal: RedemptionSignal }
  /** Tie: two+ pendings fit. Refuse to guess; a human resolves it. */
  | { kind: 'AMBIGUOUS'; signal: RedemptionSignal; candidates: PendingRedemption[] };

export interface ReconcilePaymentDeps {
  pendings: PendingRedemptionStore;
  events: WebhookEventStore;
  ledger: RedemptionFinalizer;
  /** Override the match window (defaults to ±10 min). */
  windowMs?: number;
}

/**
 * Reconcile one Square OTHER-tender payment against the pending redemptions.
 * Deduped by Square `eventId`; the ledger write is additionally idempotent on
 * the payment id, so a re-delivery can never double-deduct.
 */
export async function reconcilePayment(
  eventId: string,
  signal: RedemptionSignal,
  deps: ReconcilePaymentDeps,
): Promise<MatchOutcome> {
  if (await deps.events.hasProcessed(eventId)) {
    return { kind: 'DUPLICATE', eventId };
  }

  const windowMs = deps.windowMs ?? DEFAULT_WINDOW_MS;
  const signalAt = Date.parse(signal.occurredAt);

  const open = await deps.pendings.listOpen();
  const candidates = open.filter(
    (p) =>
      p.amountCents === signal.amountCents &&
      p.locationId === signal.locationId &&
      Math.abs(Date.parse(p.createdAt) - signalAt) <= windowMs,
  );

  // No pending: surface loudly, but record the event so a retry doesn't
  // re-alert. (Refunds and later resolution are separate events.)
  if (candidates.length === 0) {
    await deps.events.markProcessed(eventId);
    return { kind: 'NO_PENDING', signal };
  }

  // Ambiguous: never guess between same-amount pendings in the same window.
  // Leave them PENDING so a human can resolve; mark the event handled.
  if (candidates.length > 1) {
    await deps.events.markProcessed(eventId);
    return { kind: 'AMBIGUOUS', signal, candidates };
  }

  const pending = candidates[0]!;

  // Finalize through the engine. enforceBalance:false — this is the
  // reconcile-after path; reconciliation flags any negative. Idempotent on the
  // Square payment id: the real double-post guard, independent of event dedupe.
  const ledgerEntry = await deps.ledger.redeemCredit({
    customerId: pending.customerId,
    amountCents: pending.amountCents,
    enforceBalance: false,
    sourceRef: signal.paymentId,
    idempotencyKey: `square-redeem:${signal.paymentId}`,
    note: `Store credit reconciled to Square payment ${signal.paymentId}`,
  });

  const reconciled = await deps.pendings.markReconciled(pending.id, {
    paymentId: signal.paymentId,
    reconciledAt: signal.occurredAt,
    ledgerEntryId: ledgerEntry.id,
  });

  await deps.events.markProcessed(eventId);
  return { kind: 'RECONCILED', pending: reconciled, ledgerEntry };
}

/**
 * The reconciliation-relevant facts from a Square refund event. The refund is
 * tied to the *payment* it refunds — that payment id is how we find the right
 * redemption to reverse. `amountCents` is the refunded amount (may be partial).
 */
export interface RefundSignal {
  refundId: string;
  /** The Square payment being refunded — the join key to the redemption. */
  paymentId: string;
  amountCents: number;
  occurredAt: string;
}

export type RefundOutcome =
  | { kind: 'DUPLICATE'; eventId: string }
  /** Credit returned to the customer tied to the refunded payment. */
  | { kind: 'REVERSED'; pending: PendingRedemption; ledgerEntry: LedgerEntry }
  /** Refund for a payment we never reconciled to a redemption — surface, don't guess. */
  | { kind: 'NO_RECONCILED_REDEMPTION'; signal: RefundSignal };

export interface ReverseRefundDeps {
  pendings: PendingRedemptionStore;
  events: WebhookEventStore;
  ledger: RefundReverser;
}

/**
 * Reverse a refunded store-credit redemption. The refund returns credit to the
 * *specific* customer whose redemption was reconciled to the refunded payment —
 * never a blind positive entry. Idempotent on the Square refund id (a generic
 * key the engine treats opaquely), plus event dedupe, so a retried refund can't
 * return credit twice.
 */
export async function reverseRefund(
  eventId: string,
  signal: RefundSignal,
  deps: ReverseRefundDeps,
): Promise<RefundOutcome> {
  if (await deps.events.hasProcessed(eventId)) {
    return { kind: 'DUPLICATE', eventId };
  }

  const pending = await deps.pendings.findByReconciledPaymentId(signal.paymentId);
  if (!pending) {
    // The refunded payment was never reconciled to an app redemption. Surface
    // it for a human rather than crediting someone arbitrarily.
    await deps.events.markProcessed(eventId);
    return { kind: 'NO_RECONCILED_REDEMPTION', signal };
  }

  const ledgerEntry = await deps.ledger.reverse({
    customerId: pending.customerId,
    amountCents: signal.amountCents, // refunded cents — handles partial refunds
    sourceRef: signal.refundId,
    idempotencyKey: `square-refund:${signal.refundId}`,
    note: `Refund of Square payment ${signal.paymentId} — credit returned`,
  });

  await deps.events.markProcessed(eventId);
  return { kind: 'REVERSED', pending, ledgerEntry };
}

/**
 * The other failure mode, found by sweep rather than webhook: pending
 * redemptions whose match window has fully elapsed with no Square payment.
 * These are "marked redeemed in the app, no Square sale found" — surface them;
 * the caller decides whether to alert and `markExpired`.
 */
export async function findStalePendings(
  pendings: PendingRedemptionStore,
  asOfIso: string,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<PendingRedemption[]> {
  const asOf = Date.parse(asOfIso);
  const open = await pendings.listOpen();
  return open.filter((p) => asOf - Date.parse(p.createdAt) > windowMs);
}
