import { Cents, LedgerEntry } from './types';
import {
  Redemption,
  RedemptionOrigin,
  RedemptionRepository,
} from '../ports/redemptionRepository';

/**
 * The redemption spine — the ONE place a redemption from either origin hits the
 * engine (walkthrough §2). It is deliberately origin-agnostic: idea 1 (Square
 * OTHER tender, attributed by a human) and idea 2 (in-app EXTERNAL payment,
 * customer known at creation) both call `finalizeRedemption` and nothing else
 * touches the ledger for redemptions.
 *
 * It never imports Square or Postgres — it depends only on the engine's public
 * `Ledger` surface (structurally, via `FinalizeLedger`) and the
 * `RedemptionRepository` port. That keeps the engine untouched and the spine
 * unit-testable against in-memory adapters.
 */

/** The minimal engine surface the spine needs. `Ledger` satisfies it structurally. */
export interface FinalizeLedger {
  getBalance(customerId: string): Promise<Cents>;
  redeemCredit(args: {
    customerId: string;
    amountCents: Cents;
    sourceRef?: string;
    idempotencyKey?: string;
    enforceBalance?: boolean;
    note?: string;
  }): Promise<LedgerEntry>;
  reverse(args: {
    customerId: string;
    amountCents: Cents;
    sourceRef?: string;
    idempotencyKey?: string;
    note?: string;
  }): Promise<LedgerEntry>;
}

export interface FinalizeDeps {
  ledger: FinalizeLedger;
  redemptions: RedemptionRepository;
}

export interface FinalizeRedemptionArgs {
  redemptionId: string;
  customerId: string;
  amountCents: Cents;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  origin: RedemptionOrigin;
  /** When true, a redemption over the balance finalizes with a flag instead of asking. */
  allowNegative?: boolean;
}

export type FinalizeResult =
  | { ok: true; ledgerEntryId: string; negativeBalance: boolean; alreadyFinalized: boolean }
  /** Over the customer's available credit and not yet confirmed — the UI asks. */
  | { ok: false; needsConfirm: true; available: Cents };

/**
 * The ledger idempotency key for a redemption draw-down.
 *
 * Payment-anchored (walkthrough §3: key = the Square payment id) but namespaced
 * by the attribution attempt. Attempt 1 (the normal case) is exactly
 * `square-redeem:<paymentId>`; a reassign bumps the attempt and thus the key,
 * so the re-finalize actually draws on the corrected customer instead of
 * dedupe-ing into the original (wrong) entry. Webhook replay is still blocked
 * upstream by UNIQUE(square_payment_id) + the finalized-status guard below, so
 * this refinement does not weaken replay protection.
 */
export function redeemIdempotencyKey(
  squarePaymentId: string | null | undefined,
  attempt: number,
): string {
  const anchor = squarePaymentId ?? 'no-payment';
  return attempt <= 1
    ? `square-redeem:${anchor}`
    : `square-redeem:${anchor}:reassign:${attempt}`;
}

function isNegativeFlagged(flags: Record<string, unknown> | null): boolean {
  return !!flags && flags['negative_balance'] === true;
}

/**
 * Finalize a redemption against the ledger. Both origins call this.
 *
 *   1. Idempotent no-op if the row is already finalized (replay / double-submit).
 *   2. available = engine-derived balance. Over it without `allowNegative`
 *      → { needsConfirm, available }. (Outstanding is 0 in v2: attribution
 *      finalizes synchronously, so there is no assigned-but-unfinalized state;
 *      legacy pendings are a separate, single-owner-sequential fast path. The
 *      negative_balance flag + reconciliation sweep are the backstop.)
 *   3. Draw down via engine.redeemCredit (enforceBalance:false — the Square sale
 *      already rang; the cap was the human's job at attribution). Idempotent on
 *      the payment-anchored key.
 *   4. Link the ledger entry, set the customer, flip status → finalized.
 */
export async function finalizeRedemption(
  args: FinalizeRedemptionArgs,
  deps: FinalizeDeps,
): Promise<FinalizeResult> {
  const row = await deps.redemptions.getById(args.redemptionId);
  if (!row) throw new Error(`Redemption ${args.redemptionId} not found`);

  // (1) Already finalized → idempotent no-op (webhook replay, double-tapped Assign).
  if (row.status === 'finalized' && row.ledgerEntryId) {
    return {
      ok: true,
      ledgerEntryId: row.ledgerEntryId,
      negativeBalance: isNegativeFlagged(row.flags),
      alreadyFinalized: true,
    };
  }

  // (2) Cap check against the engine's derived balance (no hand-rolled math).
  const available = await deps.ledger.getBalance(args.customerId);
  if (args.amountCents > available && !args.allowNegative) {
    return { ok: false, needsConfirm: true, available };
  }
  const negativeBalance = args.amountCents > available;

  // (3) The one engine touch. enforceBalance:false — a forced negative is a flag,
  // not a reject. Idempotent on the payment-anchored, attempt-scoped key.
  const entry = await deps.ledger.redeemCredit({
    customerId: args.customerId,
    amountCents: args.amountCents,
    enforceBalance: false,
    idempotencyKey: redeemIdempotencyKey(args.squarePaymentId, row.attributionAttempt),
    ...(args.squarePaymentId ? { sourceRef: args.squarePaymentId } : {}),
    note: `Redemption finalized (${args.origin})${
      args.squarePaymentId ? ` — Square payment ${args.squarePaymentId}` : ''
    }`,
  });

  // (4) Link + flip status.
  const finalized = await deps.redemptions.markFinalized(args.redemptionId, {
    customerId: args.customerId,
    squarePaymentId: args.squarePaymentId ?? null,
    squareOrderId: args.squareOrderId ?? null,
    ledgerEntryId: entry.id,
    negativeBalance,
  });

  return {
    ok: true,
    ledgerEntryId: entry.id,
    negativeBalance: isNegativeFlagged(finalized.flags),
    alreadyFinalized: false,
  };
}

/**
 * Refund path: return credit to the customer whose redemption was tied to the
 * refunded Square payment, and flip the row → reversed. Append-only: a new
 * REVERSAL entry, never an edit. Idempotent on the refund id (keyed by the
 * caller, `square-refund:<id>`), so a retried refund webhook can't credit twice.
 */
export async function reverseRedemptionForRefund(
  args: { redemption: Redemption; refundAmountCents: Cents; refundIdempotencyKey: string; note?: string },
  deps: FinalizeDeps,
): Promise<LedgerEntry> {
  const { redemption } = args;
  if (!redemption.customerId) {
    throw new Error(`Cannot reverse redemption ${redemption.id}: no customer attributed`);
  }
  const entry = await deps.ledger.reverse({
    customerId: redemption.customerId,
    amountCents: args.refundAmountCents,
    idempotencyKey: args.refundIdempotencyKey,
    ...(redemption.squarePaymentId ? { sourceRef: redemption.squarePaymentId } : {}),
    ...(args.note ? { note: args.note } : {}),
  });
  await deps.redemptions.markReversed(redemption.id);
  return entry;
}

/**
 * Reassign a wrong-customer redemption. Appends a REVERSAL to the wrongly-charged
 * customer (keyed `reassign:<paymentId>:<attempt>` so it is idempotent yet
 * distinct from a refund reversal) and re-opens the row for attribution. The
 * corrected customer is then assigned through `finalizeRedemption`, which bumps
 * the attempt and so draws a fresh REDEEM. Append-only throughout.
 */
export async function reassignRedemption(
  redemptionId: string,
  deps: FinalizeDeps,
): Promise<Redemption> {
  const row = await deps.redemptions.getById(redemptionId);
  if (!row) throw new Error(`Redemption ${redemptionId} not found`);
  if (row.status !== 'finalized' || !row.customerId) {
    throw new Error(`Redemption ${redemptionId} is not finalized; nothing to reassign`);
  }
  const anchor = row.squarePaymentId ?? row.id;
  await deps.ledger.reverse({
    customerId: row.customerId,
    amountCents: row.amountCents,
    idempotencyKey: `reassign:${anchor}:${row.attributionAttempt}`,
    ...(row.squarePaymentId ? { sourceRef: row.squarePaymentId } : {}),
    note: `Reassigned — credit returned to ${row.customerId} before re-attribution`,
  });
  return deps.redemptions.requeue(redemptionId);
}
