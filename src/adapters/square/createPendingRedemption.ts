import { Cents } from '../../domain/types';
import {
  NewPendingRedemption,
  PendingRedemption,
  PendingRedemptionStore,
} from './pendingRedemptions';

/**
 * Creating a redeem intent — the front of the app-first flow, with the cap
 * that makes `enforceBalance:false` on finalization defensible.
 *
 * Why the cap lives here, not at finalization: once a sale has rung on Square
 * it is a done deal, so the matcher must record it even if it lands the balance
 * negative (a negative becomes a flag, never a rejection). That is only safe if
 * the amount was capped *before* it was rung. So the cap is enforced at
 * creation — and crucially against **available** credit, not raw balance:
 *
 *     available = balance − Σ(amount of this customer's still-open pendings)
 *
 * Without subtracting outstanding pendings, two overlapping $60 redemptions on
 * a $60 customer could both pass a raw-balance check and both finalize to −$60.
 * Single-owner sequential ringing makes that rare, but the flag is exactly the
 * hole it would open, so we prevent it here by decision. The reconciliation
 * negative-balance sweep remains the backstop for any truly concurrent race.
 */

export class InsufficientAvailableCreditError extends Error {
  constructor(
    public readonly customerId: string,
    public readonly availableCents: Cents,
    public readonly requestedCents: Cents,
  ) {
    super(
      `Redemption of ${requestedCents}¢ exceeds available credit of ` +
        `${availableCents}¢ for customer ${customerId} ` +
        `(balance minus outstanding pending redemptions)`,
    );
    this.name = 'InsufficientAvailableCreditError';
  }
}

/** The minimal ledger surface this needs: a balance read. `Ledger` satisfies it. */
export interface BalanceReader {
  getBalance(customerId: string): Promise<Cents>;
}

export interface CreatePendingDeps {
  balances: BalanceReader;
  pendings: PendingRedemptionStore;
}

/**
 * Credit a customer can still pledge to a new redemption: confirmed balance
 * minus everything already pledged in still-open pendings.
 */
export async function availableCreditCents(
  customerId: string,
  deps: CreatePendingDeps,
): Promise<Cents> {
  const balance = await deps.balances.getBalance(customerId);
  const open = await deps.pendings.listOpen();
  const outstanding = open
    .filter((p) => p.customerId === customerId)
    .reduce((sum, p) => sum + p.amountCents, 0);
  return balance - outstanding;
}

/**
 * Create a pending redemption, capped at the customer's available credit.
 * Throws `InsufficientAvailableCreditError` if the amount would over-pledge —
 * the UI keypad should also hard-cap, but this is the guarantee at the seam.
 */
export async function createPendingRedemption(
  input: NewPendingRedemption,
  deps: CreatePendingDeps,
): Promise<PendingRedemption> {
  if (!Number.isInteger(input.amountCents)) {
    throw new Error(`Pending redemption amount must be integer cents, got ${input.amountCents}`);
  }
  if (input.amountCents <= 0) {
    throw new Error(`Pending redemption amount must be positive, got ${input.amountCents}`);
  }

  const available = await availableCreditCents(input.customerId, deps);
  if (input.amountCents > available) {
    throw new InsufficientAvailableCreditError(input.customerId, available, input.amountCents);
  }

  return deps.pendings.create(input);
}
