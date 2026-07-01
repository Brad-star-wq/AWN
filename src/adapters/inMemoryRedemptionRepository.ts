import {
  FinalizeUpdate,
  NewRedemption,
  Redemption,
  RedemptionRepository,
} from '../ports/redemptionRepository';

/**
 * In-memory redemptions store — the test double for the redemption spine, and
 * the reference the pg adapter must match (same behavior, per CLAUDE.md's
 * shared-contract note). Timestamps are ISO strings; ids are sequential.
 */
export class InMemoryRedemptionRepository implements RedemptionRepository {
  private rows = new Map<string, Redemption>();
  private seq = 0;
  private now: () => string;

  /** `now` is injectable so tests can control timestamps deterministically. */
  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  async create(input: NewRedemption): Promise<Redemption> {
    if (input.squarePaymentId) {
      const existing = await this.getByPaymentId(input.squarePaymentId);
      if (existing) return existing; // idempotent on the payment id (replay)
    }
    const ts = this.now();
    const row: Redemption = {
      id: `redemption_${++this.seq}`,
      customerId: input.customerId ?? null,
      amountCents: input.amountCents,
      locationId: input.locationId ?? null,
      squarePaymentId: input.squarePaymentId ?? null,
      squareOrderId: input.squareOrderId ?? null,
      origin: input.origin,
      status: input.status ?? 'awaiting_attribution',
      ledgerEntryId: null,
      flags: null,
      attributionAttempt: 1,
      createdAt: ts,
      finalizedAt: null,
      updatedAt: ts,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async getById(id: string): Promise<Redemption | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async getByPaymentId(squarePaymentId: string): Promise<Redemption | null> {
    for (const row of this.rows.values()) {
      if (row.squarePaymentId === squarePaymentId) return { ...row };
    }
    return null;
  }

  async listAwaitingAttribution(): Promise<Redemption[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === 'awaiting_attribution')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  }

  async listByCustomer(customerId: string): Promise<Redemption[]> {
    return [...this.rows.values()]
      .filter((r) => r.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  }

  async markFinalized(id: string, update: FinalizeUpdate): Promise<Redemption> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Unknown redemption ${id}`);
    row.customerId = update.customerId;
    if (update.squarePaymentId != null) row.squarePaymentId = update.squarePaymentId;
    if (update.squareOrderId != null) row.squareOrderId = update.squareOrderId;
    row.ledgerEntryId = update.ledgerEntryId;
    row.status = 'finalized';
    row.flags = update.negativeBalance ? { negative_balance: true } : null;
    row.finalizedAt = this.now();
    row.updatedAt = this.now();
    return { ...row };
  }

  async markReversed(id: string): Promise<Redemption> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Unknown redemption ${id}`);
    row.status = 'reversed';
    row.updatedAt = this.now();
    return { ...row };
  }

  async requeue(id: string): Promise<Redemption> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Unknown redemption ${id}`);
    row.status = 'awaiting_attribution';
    row.customerId = null;
    row.ledgerEntryId = null;
    row.flags = null;
    row.finalizedAt = null;
    row.attributionAttempt += 1;
    row.updatedAt = this.now();
    return { ...row };
  }
}
