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
  priceCents?: number;
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
  salesCents: number;
  outstandingLiabilityCents: number;
  unmatched: UnmatchedRow[];
  negativeBalances: NegativeBalanceRow[];
}

export interface ItemSoldRow {
  id: string;
  title: string;
  itemType: ItemType;
  priceCents?: number;
}

export interface CustomerDetailData {
  id: string;
  displayName: string;
  phone?: string;
  balanceCents: number;
  history: ActivityRow[];
  itemsSold: ItemSoldRow[];
}

export interface CustomerPick {
  id: string;
  displayName: string;
  phone?: string;
  balanceCents: number;
}
