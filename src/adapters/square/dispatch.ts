import {
  reconcilePayment,
  reverseRefund,
  MatchOutcome,
  RefundOutcome,
  RedemptionFinalizer,
  RefundReverser,
} from './matcher';
import { PendingRedemptionStore, WebhookEventStore } from './pendingRedemptions';
import { AlertStore } from './alerts';
import { parsePaymentEvent, parseRefundEvent } from './parseEvent';

/**
 * Webhook dispatch: Square event → (parse) → the existing, tested matcher /
 * refund logic → (persist alerts). This layer adds NO new reconciliation
 * rules; it only routes by event type, builds the signal, and records the
 * loud-failure alerts the matcher surfaces.
 */

export interface DispatchDeps {
  pendings: PendingRedemptionStore;
  events: WebhookEventStore;
  ledger: RedemptionFinalizer & RefundReverser;
  alerts: AlertStore;
  windowMs?: number;
}

export type DispatchResult =
  | { kind: 'PAYMENT'; outcome: MatchOutcome }
  | { kind: 'REFUND'; outcome: RefundOutcome }
  | { kind: 'IGNORED'; reason: string };

function eventId(event: Record<string, unknown>): string | null {
  return typeof event.event_id === 'string' ? event.event_id : null;
}

export async function processSquareEvent(
  event: Record<string, unknown>,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const id = eventId(event);
  if (!id) return { kind: 'IGNORED', reason: 'missing-event-id' };
  const type = typeof event.type === 'string' ? event.type : '';

  if (type === 'payment.created' || type === 'payment.updated') {
    const signal = parsePaymentEvent(event);
    // Not a COMPLETED OTHER-tender payment (e.g. the early created event, or a
    // card sale) — ignore it without marking processed, so the later COMPLETED
    // event still gets its chance.
    if (!signal) return { kind: 'IGNORED', reason: 'not-a-completed-other-payment' };

    const outcome = await reconcilePayment(id, signal, {
      pendings: deps.pendings,
      events: deps.events,
      ledger: deps.ledger,
      ...(deps.windowMs !== undefined ? { windowMs: deps.windowMs } : {}),
    });

    if (outcome.kind === 'NO_PENDING') {
      await deps.alerts.record({
        kind: 'NO_PENDING',
        paymentId: signal.paymentId,
        amountCents: signal.amountCents,
        locationId: signal.locationId,
      });
    } else if (outcome.kind === 'AMBIGUOUS') {
      await deps.alerts.record({
        kind: 'AMBIGUOUS',
        paymentId: signal.paymentId,
        amountCents: signal.amountCents,
        locationId: signal.locationId,
        detail: { candidateIds: outcome.candidates.map((c) => c.id) },
      });
    }
    return { kind: 'PAYMENT', outcome };
  }

  if (type === 'refund.created' || type === 'refund.updated') {
    const signal = parseRefundEvent(event);
    if (!signal) return { kind: 'IGNORED', reason: 'not-a-completed-refund' };

    const outcome = await reverseRefund(id, signal, {
      pendings: deps.pendings,
      events: deps.events,
      ledger: deps.ledger,
    });

    if (outcome.kind === 'NO_RECONCILED_REDEMPTION') {
      await deps.alerts.record({
        kind: 'REFUND_NO_REDEMPTION',
        refundId: signal.refundId,
        paymentId: signal.paymentId,
        amountCents: signal.amountCents,
      });
    }
    return { kind: 'REFUND', outcome };
  }

  return { kind: 'IGNORED', reason: `unhandled-type:${type}` };
}
