/**
 * App-owned reconciliation state (the Square side of the port).
 *
 * Per the Phase 5 model: the app owns *who* and *how much*, Square confirms
 * *it happened*. That "who/how much" intent is a **pending redemption** — a
 * record the app writes when the owner starts a redeem, before any ledger
 * entry is finalized. The webhook matcher later confirms it against a Square
 * payment (amount + location + time) and only then finalizes the ledger.
 *
 * This lives outside the POS-agnostic engine on purpose: `location` and the
 * time-window match are Square-shaped concerns, so they must not leak into
 * `domain/`. The matcher orchestrates and calls the engine's existing
 * `redeemCredit` to do the actual append.
 *
 * These interfaces mirror the repo's port style (in-memory here for tests; a
 * Postgres-backed impl wires into `apps/web` against the new tables).
 */

export type PendingStatus = 'PENDING' | 'RECONCILED' | 'EXPIRED';

export interface PendingRedemption {
  id: string;
  /** The app's source of truth for *who* — set when the redeem starts. */
  customerId: string;
  /** Integer cents. The amount the owner will ring on Square. */
  amountCents: number;
  /** Square location the redemption will be rung at — part of the match key. */
  locationId: string;
  /** When the intent was created (ISO). The time-window anchor. */
  createdAt: string;
  status: PendingStatus;
  /** Set on reconcile: the Square payment that confirmed this redemption. */
  reconciledPaymentId?: string;
  reconciledAt?: string;
  /** The finalized ledger entry id, once posted through the engine. */
  ledgerEntryId?: string;
}

/** A new pending redemption, before the store assigns an id/status. */
export interface NewPendingRedemption {
  customerId: string;
  amountCents: number;
  locationId: string;
  createdAt: string;
}

export interface ReconcileInfo {
  paymentId: string;
  reconciledAt: string;
  ledgerEntryId: string;
}

export interface PendingRedemptionStore {
  create(input: NewPendingRedemption): Promise<PendingRedemption>;
  get(id: string): Promise<PendingRedemption | null>;
  /** Every redemption still awaiting confirmation (status === 'PENDING'). */
  listOpen(): Promise<PendingRedemption[]>;
  /**
   * The redemption reconciled to a given Square payment, if any. The refund
   * path uses this to return credit to the *right* customer.
   */
  findByReconciledPaymentId(paymentId: string): Promise<PendingRedemption | null>;
  markReconciled(id: string, info: ReconcileInfo): Promise<PendingRedemption>;
  /** Window elapsed with no Square payment — surfaced as a failure mode. */
  markExpired(id: string): Promise<PendingRedemption>;
}

/**
 * Dedupe of Square webhook deliveries. Square retries; each `event_id` must be
 * processed at most once. This is the optimization layer — the real
 * double-post guard is still the ledger's idempotency key on the payment id.
 */
export interface WebhookEventStore {
  hasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}

function assertPositiveCents(amountCents: number): void {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`Pending redemption amount must be integer cents, got ${amountCents}`);
  }
  if (amountCents <= 0) {
    throw new Error(`Pending redemption amount must be positive, got ${amountCents}`);
  }
}

export class InMemoryPendingRedemptionStore implements PendingRedemptionStore {
  private rows = new Map<string, PendingRedemption>();
  private seq = 0;

  async create(input: NewPendingRedemption): Promise<PendingRedemption> {
    assertPositiveCents(input.amountCents);
    const row: PendingRedemption = {
      id: `pending_${++this.seq}`,
      customerId: input.customerId,
      amountCents: input.amountCents,
      locationId: input.locationId,
      createdAt: input.createdAt,
      status: 'PENDING',
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async get(id: string): Promise<PendingRedemption | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async listOpen(): Promise<PendingRedemption[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === 'PENDING')
      .map((r) => ({ ...r }));
  }

  async findByReconciledPaymentId(paymentId: string): Promise<PendingRedemption | null> {
    for (const row of this.rows.values()) {
      if (row.reconciledPaymentId === paymentId) return { ...row };
    }
    return null;
  }

  async markReconciled(id: string, info: ReconcileInfo): Promise<PendingRedemption> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Unknown pending redemption ${id}`);
    if (row.status === 'EXPIRED') {
      throw new Error(`Cannot reconcile an expired pending redemption ${id}`);
    }
    row.status = 'RECONCILED';
    row.reconciledPaymentId = info.paymentId;
    row.reconciledAt = info.reconciledAt;
    row.ledgerEntryId = info.ledgerEntryId;
    return { ...row };
  }

  async markExpired(id: string): Promise<PendingRedemption> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Unknown pending redemption ${id}`);
    if (row.status === 'RECONCILED') {
      throw new Error(`Cannot expire a reconciled pending redemption ${id}`);
    }
    row.status = 'EXPIRED';
    return { ...row };
  }
}

export class InMemoryWebhookEventStore implements WebhookEventStore {
  private processed = new Set<string>();

  async hasProcessed(eventId: string): Promise<boolean> {
    return this.processed.has(eventId);
  }

  async markProcessed(eventId: string): Promise<void> {
    this.processed.add(eventId);
  }
}
