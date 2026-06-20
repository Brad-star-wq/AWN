/**
 * Core domain types for the resale engine.
 *
 * Money convention: every monetary value is an integer number of cents.
 * There are no floats anywhere in the money path.
 */

/** Integer cents. Branded for clarity at call sites. */
export type Cents = number;

export type LedgerKind = 'ISSUE' | 'REDEEM' | 'ADJUST' | 'REVERSAL';
export type LedgerSource = 'INTAKE' | 'SALE' | 'MANUAL';

export interface Customer {
  id: string;
  displayName: string;
  phone?: string;
  /** The POS customer id — the reconciliation join key. */
  posCustomerRef?: string;
}

export interface LedgerEntry {
  id: string;
  customerId: string;
  kind: LedgerKind;
  /** Signed delta. ISSUE > 0, REDEEM < 0. Balance = sum of deltas. */
  deltaCents: Cents;
  source: LedgerSource;
  sourceRef?: string;
  /** Unique key guaranteeing an external event posts at most once. */
  idempotencyKey?: string;
  note?: string;
  createdBy?: string;
  createdAt: string;
}

/** A new entry, before the store assigns id/createdAt. */
export type NewLedgerEntry = Omit<LedgerEntry, 'id' | 'createdAt'>;

// ----------------------------------------------------------------
// The adapter seam: a POS-agnostic sale.
//
// Every adapter (Square, the mock, anything future) maps its own
// payload into this shape. The engine only ever sees SaleEvent —
// it has no knowledge of Square specifically.
// ----------------------------------------------------------------

export type TenderType = 'CARD' | 'CASH' | 'STORE_CREDIT' | 'OTHER';

export interface Tender {
  type: TenderType;
  amountCents: Cents;
  /**
   * Optional label. Square does not always expose a named "Store Credit"
   * tender — on much of its POS it surfaces as an OTHER tender with a
   * note. The engine treats an OTHER tender noted "store credit" as
   * store credit, so both shapes work.
   */
  note?: string;
}

export interface SaleEvent {
  /** Unique id used for idempotency — a sale is applied at most once. */
  eventId: string;
  orderRef: string;
  /** POS customer id, if one was attached to the sale. */
  customerRef?: string;
  occurredAt: string;
  tenders: Tender[];
}

// ---- Draft products --------------------------------------------

export type ItemType = 'SHOE' | 'CARD' | 'OTHER';
export type DraftStatus = 'DRAFT' | 'READY' | 'PUSHED';

export interface DraftProduct {
  id: string;
  sourceCustomerId?: string;
  itemType: ItemType;
  attributes: Record<string, unknown>;
  priceCents?: Cents;
  status: DraftStatus;
  online: boolean;
  posCatalogRef?: string;
  /** When the stub was created — drives the drafts "aging" flag. Set by the store. */
  createdAt?: string;
}
