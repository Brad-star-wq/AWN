// Plain, serializable view models passed from server components to the UI.
// (Engine domain objects are already plain; these name the app's read shapes.)

export type LedgerKind = 'ISSUE' | 'REDEEM' | 'ADJUST' | 'REVERSAL';
export type ItemType = 'SHOE' | 'CARD' | 'OTHER';
export type DraftStatus = 'DRAFT' | 'READY' | 'PUSHED';

export interface ActivityRow {
  id: string;
  kind: LedgerKind;
  deltaCents: number;
  createdAt: string;
  customerId: string;
  customerName: string;
  note?: string;
  sourceRef?: string;
  /** Items the customer brought in on this transaction (ISSUE rows). */
  addedItems?: { title: string; itemType: ItemType }[];
  /** Set when this REDEEM finalized a v2 redemption — enables "Reassign". */
  redemptionId?: string;
}

export interface CustomerRow {
  id: string;
  displayName: string;
  phone?: string;
  balanceCents: number;
  lastActivity?: string;
}

export interface DraftRow {
  id: string;
  title: string;
  itemType: ItemType;
  sourceName: string;
  sourceCustomerId?: string;
  /** The resale/list price (what it lists for; pushed to Square). */
  priceCents?: number;
  /** The buy-in cost paid at intake (drives the finish-form margin). */
  costCents?: number;
  /** Full draft attributes, so the finish form can prefill every field. */
  attributes: Record<string, unknown>;
  online: boolean;
  status: DraftStatus;
  createdAt?: string;
  posCatalogRef?: string;
}

export interface TodaySnapshot {
  givenTodayCents: number;
  usedTodayCents: number;
  salesTodayCents: number;
  outstandingLiabilityCents: number;
  draftsToFinish: number;
  needsAttentionCount: number;
  /** Redemptions rung on Square but not yet assigned past the watch threshold. */
  unassignedTooLongCount: number;
  recent: ActivityRow[];
}

export interface UnmatchedRow {
  orderRef: string;
  amountCents: number;
  reason: string;
}

export interface NegativeBalanceRow {
  customerId: string;
  displayName: string;
  balanceCents: number;
}

export interface EodSnapshot {
  givenCents: number;
  usedCents: number;
  cashCents: number;
  itemsBought: number;
  salesCents: number;
  outstandingLiabilityCents: number;
  unmatched: UnmatchedRow[];
  negativeBalances: NegativeBalanceRow[];
}

export type TxnItemStatus = 'pending' | 'in_stock' | 'sold';

export interface TxnItem {
  id: string;
  title: string;
  itemType: ItemType;
  detail?: string;
  status: TxnItemStatus;
}

/** Items a customer sold to the shop, grouped by the transaction that took them in. */
export interface TxnGroup {
  id: string;
  dateIso: string;
  payout: 'store_credit' | 'cash' | 'unknown';
  amountCents: number;
  items: TxnItem[];
}

export interface CustomerDetailData {
  id: string;
  displayName: string;
  phone?: string;
  balanceCents: number;
  memberSinceIso?: string;
  history: ActivityRow[];
  transactions: TxnGroup[];
}

export interface CustomerPick {
  id: string;
  displayName: string;
  phone?: string;
  balanceCents: number;
}

/** An unattributed redemption in the live attribution queue (v2). */
export interface RedemptionQueueItem {
  id: string;
  amountCents: number;
  locationId: string | null;
  squarePaymentId: string | null;
  createdAt: string;
}
