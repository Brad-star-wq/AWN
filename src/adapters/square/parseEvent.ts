import { RedemptionSignal, RefundSignal } from './matcher';

/**
 * Parse Square webhook envelopes into the matcher's signals — the only place
 * that touches Square's payload shape. Returns null whenever the event is not
 * an actionable store-credit redemption or refund, so the dispatcher ignores it.
 *
 * Two correctness rules live here:
 *
 *  1. **Only COMPLETED.** A payment webhook fires more than once — `created`
 *     (often APPROVED/PENDING) then `updated → COMPLETED`. We act ONLY on the
 *     COMPLETED transition, so a redemption is never finalized off an early,
 *     not-yet-final event. Refunds are the same (PENDING → COMPLETED).
 *  2. **OTHER tender only.** A store-credit redemption is rung as the external
 *     "Other Gift Card or Certificate" tender, which surfaces as a tender of
 *     `type: OTHER` (an external payment, `source_type: EXTERNAL`). Card/cash
 *     payments are ignored.
 *
 * Everything is read defensively — a missing/odd field yields null, never a throw.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function intCents(value: unknown): number | null {
  const n = typeof value === 'bigint' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** The Square Payment object carried on a `payment.*` event, if present. */
function paymentObject(event: Record<string, unknown>): Record<string, unknown> | null {
  const data = asRecord(event.data);
  const object = data && asRecord(data.object);
  return object ? asRecord(object.payment) : null;
}

function refundObject(event: Record<string, unknown>): Record<string, unknown> | null {
  const data = asRecord(event.data);
  const object = data && asRecord(data.object);
  return object ? asRecord(object.refund) : null;
}

/**
 * The store-credit (OTHER) amount on a payment, or null if it carries none.
 *
 * Prefers an explicit tender array when the payload includes one (sum the
 * `OTHER` tenders); otherwise falls back to an external payment's full amount,
 * which is how an API/external "Other" tender surfaces. (On real POS hardware,
 * confirm which shape arrives — that's the Part 6 production check.)
 */
function otherTenderCents(payment: Record<string, unknown>): number | null {
  const tenders = payment.tenders;
  if (Array.isArray(tenders)) {
    let sum = 0;
    let sawOther = false;
    for (const t of tenders) {
      const tender = asRecord(t);
      if (tender?.type === 'OTHER') {
        const money = asRecord(tender.amount_money);
        const cents = money && intCents(money.amount);
        if (cents) {
          sum += cents;
          sawOther = true;
        }
      }
    }
    return sawOther ? sum : null;
  }

  // No tender array on the object: an external payment is the OTHER-tender case.
  if (payment.source_type === 'EXTERNAL') {
    const money = asRecord(payment.amount_money);
    return money ? intCents(money.amount) : null;
  }
  return null;
}

/** A COMPLETED OTHER-tender payment → a redemption signal, else null. */
export function parsePaymentEvent(event: Record<string, unknown>): RedemptionSignal | null {
  const payment = paymentObject(event);
  if (!payment) return null;
  if (payment.status !== 'COMPLETED') return null; // ignore created/approved/pending

  const amountCents = otherTenderCents(payment);
  if (amountCents === null) return null; // not a store-credit (OTHER) payment

  const paymentId = typeof payment.id === 'string' ? payment.id : null;
  const locationId = typeof payment.location_id === 'string' ? payment.location_id : null;
  const occurredAt =
    (typeof payment.updated_at === 'string' && payment.updated_at) ||
    (typeof payment.created_at === 'string' && payment.created_at) ||
    null;
  if (!paymentId || !locationId || !occurredAt) return null;

  return { paymentId, amountCents, locationId, occurredAt };
}

/** A COMPLETED refund → a refund signal, else null. */
export function parseRefundEvent(event: Record<string, unknown>): RefundSignal | null {
  const refund = refundObject(event);
  if (!refund) return null;
  if (refund.status !== 'COMPLETED') return null;

  const refundId = typeof refund.id === 'string' ? refund.id : null;
  const paymentId = typeof refund.payment_id === 'string' ? refund.payment_id : null;
  const money = asRecord(refund.amount_money);
  const amountCents = money ? intCents(money.amount) : null;
  const occurredAt =
    (typeof refund.updated_at === 'string' && refund.updated_at) ||
    (typeof refund.created_at === 'string' && refund.created_at) ||
    null;
  if (!refundId || !paymentId || amountCents === null || !occurredAt) return null;

  return { refundId, paymentId, amountCents, occurredAt };
}
