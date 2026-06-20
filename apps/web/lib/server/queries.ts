import 'server-only';

import type { LedgerEntry, DraftProduct, Customer } from '@engine/domain/types';
import { reconcileDay } from '@engine/domain/reconciliation';
import { engine } from './engine';
import { requireOwner } from './auth';
import { draftTitle } from '@/lib/format';
import type {
  ActivityRow,
  CustomerDetailData,
  CustomerPick,
  CustomerRow,
  DraftRow,
  EodSnapshot,
  ItemSoldRow,
  TodaySnapshot,
} from '@/lib/types';

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function customerNameMap(): Promise<Map<string, string>> {
  const customers = await engine.customers.listCustomers();
  return new Map(customers.map((c) => [c.id, c.displayName]));
}

function toActivityRow(e: LedgerEntry, names: Map<string, string>): ActivityRow {
  return {
    id: e.id,
    kind: e.kind,
    deltaCents: e.deltaCents,
    createdAt: e.createdAt,
    customerId: e.customerId,
    customerName: names.get(e.customerId) ?? 'Customer',
    ...(e.note !== undefined ? { note: e.note } : {}),
    ...(e.sourceRef !== undefined ? { sourceRef: e.sourceRef } : {}),
  };
}

function toDraftRow(d: DraftProduct, names: Map<string, string>): DraftRow {
  return {
    id: d.id,
    title: draftTitle(d.itemType, d.attributes),
    itemType: d.itemType,
    sourceName: d.sourceCustomerId ? names.get(d.sourceCustomerId) ?? 'Customer' : 'Walk-in',
    ...(d.sourceCustomerId !== undefined ? { sourceCustomerId: d.sourceCustomerId } : {}),
    ...(d.priceCents !== undefined ? { priceCents: d.priceCents } : {}),
    online: d.online,
    status: d.status,
    ...(d.createdAt !== undefined ? { createdAt: d.createdAt } : {}),
    ...(d.posCatalogRef !== undefined ? { posCatalogRef: d.posCatalogRef } : {}),
  };
}

export async function getToday(): Promise<TodaySnapshot> {
  await requireOwner();
  const names = await customerNameMap();

  const todays = await engine.ledgerRepo.listEntries({ sinceIso: startOfTodayIso() });
  let givenTodayCents = 0;
  let usedTodayCents = 0;
  for (const e of todays) {
    if (e.deltaCents > 0) givenTodayCents += e.deltaCents;
    else usedTodayCents += -e.deltaCents;
  }

  const openDrafts = (await engine.draftRepo.list()).filter((d) => d.status !== 'PUSHED');
  const report = await reconcileDay([], engine.ledgerRepo);

  const recentEntries = await engine.ledgerRepo.listEntries({ limit: 8 });

  return {
    givenTodayCents,
    usedTodayCents,
    salesTodayCents: 0, // populated once the Square sales feed lands (Phase 5)
    outstandingLiabilityCents: report.totals.outstandingLiabilityCents,
    draftsToFinish: openDrafts.length,
    needsAttentionCount: report.unmatched.length + report.negativeBalances.length,
    recent: recentEntries.map((e) => toActivityRow(e, names)),
  };
}

export async function getEndOfDay(): Promise<EodSnapshot> {
  await requireOwner();

  const todays = await engine.ledgerRepo.listEntries({ sinceIso: startOfTodayIso() });
  let givenCents = 0;
  let usedCents = 0;
  for (const e of todays) {
    if (e.deltaCents > 0) givenCents += e.deltaCents;
    else usedCents += -e.deltaCents;
  }

  const report = await reconcileDay([], engine.ledgerRepo);

  return {
    givenCents,
    usedCents,
    salesCents: 0,
    outstandingLiabilityCents: report.totals.outstandingLiabilityCents,
    unmatched: report.unmatched.map((u) => ({ orderRef: u.orderRef, amountCents: u.amountCents, reason: u.reason })),
    negativeBalances: report.negativeBalances.map((n) => ({
      customerId: n.customerId,
      displayName: n.displayName,
      balanceCents: n.balanceCents,
    })),
  };
}

export async function listCustomers(filter: 'all' | 'withCredit' = 'all'): Promise<CustomerRow[]> {
  await requireOwner();
  const customers = await engine.customers.listCustomers();

  const rows: CustomerRow[] = await Promise.all(
    customers.map(async (c: Customer) => {
      const [balanceCents, recent] = await Promise.all([
        engine.ledger.getBalance(c.id),
        engine.ledgerRepo.listEntries({ customerId: c.id, limit: 1 }),
      ]);
      return {
        id: c.id,
        displayName: c.displayName,
        ...(c.phone !== undefined ? { phone: c.phone } : {}),
        balanceCents,
        ...(recent[0] ? { lastActivity: recent[0].createdAt } : {}),
      };
    }),
  );

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return filter === 'withCredit' ? rows.filter((r) => r.balanceCents > 0) : rows;
}

export async function getCustomerDetail(id: string): Promise<CustomerDetailData | null> {
  await requireOwner();
  const customer = await engine.customers.getCustomer(id);
  if (!customer) return null;

  const names = await customerNameMap();
  const [balanceCents, entries, drafts] = await Promise.all([
    engine.ledger.getBalance(id),
    engine.ledgerRepo.listEntries({ customerId: id }),
    engine.draftRepo.list({ sourceCustomerId: id }),
  ]);

  const itemsSold: ItemSoldRow[] = drafts.map((d) => ({
    id: d.id,
    title: draftTitle(d.itemType, d.attributes),
    itemType: d.itemType,
    ...(d.priceCents !== undefined ? { priceCents: d.priceCents } : {}),
  }));

  return {
    id: customer.id,
    displayName: customer.displayName,
    ...(customer.phone !== undefined ? { phone: customer.phone } : {}),
    balanceCents,
    history: entries.map((e) => toActivityRow(e, names)),
    itemsSold,
  };
}

export async function listDrafts(filter: 'all' | 'toFinish' | 'ready' = 'all'): Promise<DraftRow[]> {
  await requireOwner();
  const names = await customerNameMap();
  let drafts = await engine.draftRepo.list();
  // The Drafts screen is about open work — pushed items live in Inventory.
  drafts = drafts.filter((d) => d.status !== 'PUSHED');
  if (filter === 'toFinish') drafts = drafts.filter((d) => d.status === 'DRAFT');
  if (filter === 'ready') drafts = drafts.filter((d) => d.status === 'READY');
  return drafts.map((d) => toDraftRow(d, names));
}

export async function listInventory(): Promise<DraftRow[]> {
  await requireOwner();
  const names = await customerNameMap();
  const drafts = await engine.draftRepo.list();
  return drafts.map((d) => toDraftRow(d, names));
}

export async function searchCustomers(query: string): Promise<CustomerPick[]> {
  await requireOwner();
  const q = query.trim().toLowerCase();
  const customers = await engine.customers.listCustomers();
  const matched = q
    ? customers.filter(
        (c) => c.displayName.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
      )
    : customers;

  const picks = await Promise.all(
    matched.slice(0, 12).map(async (c) => ({
      id: c.id,
      displayName: c.displayName,
      ...(c.phone !== undefined ? { phone: c.phone } : {}),
      balanceCents: await engine.ledger.getBalance(c.id),
    })),
  );
  return picks.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getCustomerPick(id: string): Promise<CustomerPick | null> {
  await requireOwner();
  const c = await engine.customers.getCustomer(id);
  if (!c) return null;
  return {
    id: c.id,
    displayName: c.displayName,
    ...(c.phone !== undefined ? { phone: c.phone } : {}),
    balanceCents: await engine.ledger.getBalance(c.id),
  };
}
