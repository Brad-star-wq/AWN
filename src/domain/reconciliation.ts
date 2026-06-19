import { LedgerRepository } from '../ports/ledgerRepository';
import { Cents, SaleEvent } from './types';
import { storeCreditCents } from './ledger';

/**
 * Daily reconciliation: "do the books agree?"
 *
 * This is a read-only analysis pass. It does NOT post anything — the day's
 * sales were already applied through `Ledger.applySaleEvent`. It re-derives,
 * from the same events and the current ledger state, the report the owner
 * needs: how many redemptions matched, which sales couldn't be matched (the
 * needs-attention list), which balances went negative (over-redemptions),
 * and the outstanding store-credit liability.
 */

export type UnmatchedReason = 'no-customer-on-sale' | 'customer-not-found';

export interface UnmatchedSale {
  eventId: string;
  orderRef: string;
  reason: UnmatchedReason;
  /** The store-credit amount that couldn't be applied. */
  amountCents: Cents;
}

export interface NegativeBalance {
  customerId: string;
  displayName: string;
  /** Negative cents — an over-redemption to chase down. */
  balanceCents: Cents;
}

export interface ReconciliationReport {
  /** Store-credit sales that matched a known customer. */
  appliedCount: number;
  /** Sales with no store-credit tender — nothing for the ledger to do. */
  ignoredCount: number;
  /** Surfaced, never dropped: sales that should have redeemed but couldn't be matched. */
  unmatched: UnmatchedSale[];
  /** Over-redemptions: balances pushed below zero, flagged for follow-up. */
  negativeBalances: NegativeBalance[];
  totals: {
    issuedCents: Cents;
    redeemedCents: Cents;
    /**
     * The money owed to customers: the sum of **positive** balances only.
     * Negative balances are over-redemptions (surfaced above), not liability,
     * so they are not netted in.
     */
    outstandingLiabilityCents: Cents;
  };
}

export async function reconcileDay(
  events: SaleEvent[],
  repo: LedgerRepository,
): Promise<ReconciliationReport> {
  let appliedCount = 0;
  let ignoredCount = 0;
  const unmatched: UnmatchedSale[] = [];

  // Idempotency: a replayed event id is the same sale — classify it once.
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);

    const creditCents = storeCreditCents(event.tenders);
    if (creditCents === 0) {
      ignoredCount++;
      continue;
    }
    if (!event.customerRef) {
      unmatched.push({
        eventId: event.eventId,
        orderRef: event.orderRef,
        reason: 'no-customer-on-sale',
        amountCents: creditCents,
      });
      continue;
    }
    const customer = await repo.findCustomerByPosRef(event.customerRef);
    if (!customer) {
      unmatched.push({
        eventId: event.eventId,
        orderRef: event.orderRef,
        reason: 'customer-not-found',
        amountCents: creditCents,
      });
      continue;
    }
    appliedCount++;
  }

  // Balance sweep over every known customer.
  const negativeBalances: NegativeBalance[] = [];
  let outstandingLiabilityCents = 0;
  for (const customer of await repo.listCustomers()) {
    const balanceCents = await repo.getBalance(customer.id);
    if (balanceCents < 0) {
      negativeBalances.push({
        customerId: customer.id,
        displayName: customer.displayName,
        balanceCents,
      });
    } else {
      outstandingLiabilityCents += balanceCents;
    }
  }

  const { issuedCents, redeemedCents } = await repo.ledgerTotals();

  return {
    appliedCount,
    ignoredCount,
    unmatched,
    negativeBalances,
    totals: { issuedCents, redeemedCents, outstandingLiabilityCents },
  };
}
