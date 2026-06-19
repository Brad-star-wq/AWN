import { LedgerRepository } from '../ports/ledgerRepository';
import { Cents, LedgerEntry, SaleEvent, Tender } from './types';

/** Raised when an enforced redemption would push the balance negative. */
export class OverdrawError extends Error {
  constructor(
    public readonly customerId: string,
    public readonly balanceCents: Cents,
    public readonly requestedCents: Cents,
  ) {
    super(
      `Redemption of ${requestedCents}¢ exceeds balance of ${balanceCents}¢ ` +
        `for customer ${customerId}`,
    );
    this.name = 'OverdrawError';
  }
}

/** Outcome of applying a sale event to the ledger. */
export type ApplyResult =
  | { status: 'APPLIED'; customerId: string; creditCents: Cents; entry: LedgerEntry }
  | { status: 'IGNORED'; reason: 'no-store-credit' | 'already-applied' }
  | { status: 'UNMATCHED'; reason: 'no-customer-on-sale' | 'customer-not-found'; creditCents: Cents };

function assertPositive(amountCents: Cents): void {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`Amount must be integer cents, got ${amountCents}`);
  }
  if (amountCents <= 0) {
    throw new Error(`Amount must be positive, got ${amountCents}`);
  }
}

/**
 * Recognize the store-credit portion of a sale's tenders.
 *
 * A tender counts as store credit when it is a STORE_CREDIT tender, or an
 * OTHER tender whose note reads "store credit" — covering both shapes
 * Square can produce. Multiple matching tenders are summed.
 */
export function storeCreditCents(tenders: Tender[]): Cents {
  return tenders.reduce((sum, t) => {
    const isStoreCredit =
      t.type === 'STORE_CREDIT' ||
      (t.type === 'OTHER' && !!t.note && /store\s*credit/i.test(t.note));
    return isStoreCredit ? sum + t.amountCents : sum;
  }, 0);
}

/**
 * The credit ledger.
 *
 * Every balance-changing operation is an append of an immutable, signed
 * entry. The balance is always derived as the sum of those entries —
 * there is no mutable balance to drift.
 */
export class Ledger {
  constructor(private readonly repo: LedgerRepository) {}

  getBalance(customerId: string): Promise<Cents> {
    return this.repo.getBalance(customerId);
  }

  /** Issue store credit to a customer (typically from a buy-in / intake). */
  async issueCredit(args: {
    customerId: string;
    amountCents: Cents;
    sourceRef?: string;
    idempotencyKey?: string;
    note?: string;
    createdBy?: string;
  }): Promise<LedgerEntry> {
    assertPositive(args.amountCents);
    return this.repo.appendEntry({
      customerId: args.customerId,
      kind: 'ISSUE',
      deltaCents: args.amountCents,
      source: 'INTAKE',
      sourceRef: args.sourceRef,
      idempotencyKey: args.idempotencyKey,
      note: args.note,
      createdBy: args.createdBy,
    });
  }

  /**
   * Redeem store credit. Partial amounts are first-class — a redemption is
   * simply an entry for the amount used.
   *
   * `enforceBalance: true` rejects an overdraw (the app-first flow, where
   * the app caps the amount). `false` records the redemption regardless and
   * lets reconciliation flag any negative balance (the Square-first flow).
   */
  async redeemCredit(args: {
    customerId: string;
    amountCents: Cents;
    sourceRef?: string;
    idempotencyKey?: string;
    enforceBalance?: boolean;
    note?: string;
    createdBy?: string;
  }): Promise<LedgerEntry> {
    assertPositive(args.amountCents);

    if (args.enforceBalance) {
      const balance = await this.repo.getBalance(args.customerId);
      if (args.amountCents > balance) {
        throw new OverdrawError(args.customerId, balance, args.amountCents);
      }
    }

    return this.repo.appendEntry({
      customerId: args.customerId,
      kind: 'REDEEM',
      deltaCents: -args.amountCents,
      source: 'SALE',
      sourceRef: args.sourceRef,
      idempotencyKey: args.idempotencyKey,
      note: args.note,
      createdBy: args.createdBy,
    });
  }

  /**
   * Apply a normalized sale event to the ledger.
   *
   * Finds the store-credit tender, resolves the customer by POS id, and
   * posts a REDEEM — idempotently, keyed on the event id, so replaying the
   * same sale (duplicate webhook, catch-up pull) never double-deducts.
   *
   * Returns a structured result the reconciliation layer can act on:
   * unmatched sales (no customer, or unknown customer) are surfaced rather
   * than silently dropped.
   */
  async applySaleEvent(event: SaleEvent): Promise<ApplyResult> {
    const creditCents = storeCreditCents(event.tenders);
    if (creditCents === 0) {
      return { status: 'IGNORED', reason: 'no-store-credit' };
    }

    const idempotencyKey = `sale:${event.eventId}`;
    if (await this.repo.hasIdempotencyKey(idempotencyKey)) {
      return { status: 'IGNORED', reason: 'already-applied' };
    }

    if (!event.customerRef) {
      return { status: 'UNMATCHED', reason: 'no-customer-on-sale', creditCents };
    }

    const customer = await this.repo.findCustomerByPosRef(event.customerRef);
    if (!customer) {
      return { status: 'UNMATCHED', reason: 'customer-not-found', creditCents };
    }

    const entry = await this.redeemCredit({
      customerId: customer.id,
      amountCents: creditCents,
      sourceRef: event.orderRef,
      idempotencyKey,
      enforceBalance: false, // reconcile-after model; reconciliation flags negatives
      note: `Store credit redeemed on order ${event.orderRef}`,
    });

    return { status: 'APPLIED', customerId: customer.id, creditCents, entry };
  }
}
