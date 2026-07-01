import { Cents } from '../domain/types';

/**
 * The redemptions store — the port the redemption spine depends on.
 *
 * A `redemptions` row is one record type for a redemption from EITHER origin
 * (walkthrough §2). The domain `finalizeRedemption` depends only on this
 * interface, never on Postgres or Square, so it stays POS-agnostic and unit
 * testable against the in-memory adapter.
 */

/** How a redemption row came to exist. The finalize spine never branches on it. */
export type RedemptionOrigin = 'square_pos_other_tender' | 'app_external_payment';

export type RedemptionStatus =
  | 'awaiting_attribution'
  | 'finalized'
  | 'reversed'
  | 'void';

export interface Redemption {
  id: string;
  /** null until attributed (idea 1); known at creation (idea 2). */
  customerId: string | null;
  amountCents: Cents;
  locationId: string | null;
  /** The idempotency anchor — one Square payment → at most one redemption. */
  squarePaymentId: string | null;
  squareOrderId: string | null;
  origin: RedemptionOrigin;
  status: RedemptionStatus;
  ledgerEntryId: string | null;
  flags: Record<string, unknown> | null;
  /** 1 on create; bumped each reassign. Namespaces the redeem idempotency key. */
  attributionAttempt: number;
  createdAt: string;
  finalizedAt: string | null;
  updatedAt: string;
}

/** A new redemption row, before the store assigns id/status/timestamps. */
export interface NewRedemption {
  customerId?: string | null;
  amountCents: Cents;
  locationId?: string | null;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  origin: RedemptionOrigin;
  /** Defaults to 'awaiting_attribution'. */
  status?: RedemptionStatus;
}

/** The fields set when a redemption is finalized against the ledger. */
export interface FinalizeUpdate {
  customerId: string;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  ledgerEntryId: string;
  negativeBalance: boolean;
}

export interface RedemptionRepository {
  /**
   * Insert a redemption. Idempotent on `square_payment_id`: if a row already
   * exists for the payment, the existing row is returned (webhook replay).
   */
  create(input: NewRedemption): Promise<Redemption>;
  getById(id: string): Promise<Redemption | null>;
  getByPaymentId(squarePaymentId: string): Promise<Redemption | null>;
  /** The attribution queue: rows still awaiting a human, newest first. */
  listAwaitingAttribution(): Promise<Redemption[]>;
  /** Every redemption attributed to a customer (used to offer Reassign). */
  listByCustomer(customerId: string): Promise<Redemption[]>;
  /** Link the ledger entry, set the customer, flip status → finalized. */
  markFinalized(id: string, update: FinalizeUpdate): Promise<Redemption>;
  /** Refund path: flip a finalized row → reversed. */
  markReversed(id: string): Promise<Redemption>;
  /**
   * Reassign: return a finalized row to awaiting_attribution, clear the
   * customer + ledger link + flags, and bump attribution_attempt. Append-only
   * on the ledger side (the caller posts the reversal); this only re-opens the
   * row so the corrected customer can be assigned.
   */
  requeue(id: string): Promise<Redemption>;
}
