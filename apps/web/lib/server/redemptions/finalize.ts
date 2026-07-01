import 'server-only';

import {
  finalizeRedemption as finalizeCore,
  reassignRedemption as reassignCore,
  reverseRedemptionForRefund as reverseForRefundCore,
  type FinalizeRedemptionArgs,
  type FinalizeResult,
} from '@engine/domain/redemptions';
import type { Redemption } from '@engine/ports/redemptionRepository';
import type { LedgerEntry } from '@engine/domain/types';
import { engine } from '@/lib/server/engine';

/**
 * The app-facing binding of the redemption spine (walkthrough Phase B).
 *
 * `finalizeRedemption` is the ONLY place the app draws the ledger down for a
 * redemption, and it is origin-agnostic: idea 1 (attribution action) and idea 2
 * (in-app EXTERNAL payment, later) both call this and nothing else. The real
 * logic lives in `@engine/domain/redemptions` (POS-agnostic, unit tested); this
 * only wires the engine's ledger + the pg redemptions store into it.
 */
export function finalizeRedemption(args: FinalizeRedemptionArgs): Promise<FinalizeResult> {
  return finalizeCore(args, { ledger: engine.ledger, redemptions: engine.redemptions });
}

/** Reassign a wrong-customer redemption: reverse + re-open for attribution. */
export function reassignRedemption(redemptionId: string): Promise<Redemption> {
  return reassignCore(redemptionId, { ledger: engine.ledger, redemptions: engine.redemptions });
}

/** Refund path: return credit to the attributed customer and mark the row reversed. */
export function reverseRedemptionForRefund(args: {
  redemption: Redemption;
  refundAmountCents: number;
  refundIdempotencyKey: string;
  note?: string;
}): Promise<LedgerEntry> {
  return reverseForRefundCore(args, { ledger: engine.ledger, redemptions: engine.redemptions });
}
