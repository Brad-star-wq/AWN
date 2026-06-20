/**
 * Reconciliation alerts — the "loud, recoverable" surface for the cases the
 * matcher refuses to resolve automatically. The matcher/refund logic stays
 * pure and returns outcomes; the dispatch layer records an alert here when an
 * outcome needs a human (no pending, ambiguous, stale, refund-with-no-redemption).
 *
 * These are persisted (not just logged) so they are checkable in the database
 * and a future dashboard can list and resolve them.
 */

export type AlertKind = 'NO_PENDING' | 'AMBIGUOUS' | 'STALE_PENDING' | 'REFUND_NO_REDEMPTION';

export interface ReconciliationAlert {
  id: string;
  kind: AlertKind;
  paymentId?: string;
  refundId?: string;
  amountCents?: number;
  locationId?: string;
  pendingId?: string;
  detail?: unknown;
  resolvedAt?: string;
  createdAt: string;
}

export interface NewAlert {
  kind: AlertKind;
  paymentId?: string;
  refundId?: string;
  amountCents?: number;
  locationId?: string;
  pendingId?: string;
  detail?: unknown;
}

export interface AlertStore {
  record(alert: NewAlert): Promise<ReconciliationAlert>;
  /** Unresolved alerts, newest first. */
  listOpen(): Promise<ReconciliationAlert[]>;
}

export class InMemoryAlertStore implements AlertStore {
  private rows: ReconciliationAlert[] = [];
  private seq = 0;

  async record(alert: NewAlert): Promise<ReconciliationAlert> {
    const row: ReconciliationAlert = {
      id: `alert_${++this.seq}`,
      kind: alert.kind,
      ...(alert.paymentId !== undefined ? { paymentId: alert.paymentId } : {}),
      ...(alert.refundId !== undefined ? { refundId: alert.refundId } : {}),
      ...(alert.amountCents !== undefined ? { amountCents: alert.amountCents } : {}),
      ...(alert.locationId !== undefined ? { locationId: alert.locationId } : {}),
      ...(alert.pendingId !== undefined ? { pendingId: alert.pendingId } : {}),
      ...(alert.detail !== undefined ? { detail: alert.detail } : {}),
      createdAt: new Date().toISOString(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async listOpen(): Promise<ReconciliationAlert[]> {
    return this.rows
      .filter((r) => r.resolvedAt === undefined)
      .map((r) => ({ ...r }))
      .reverse();
  }
}
