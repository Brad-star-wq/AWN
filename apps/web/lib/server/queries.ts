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
  TodaySnapshot,
  TxnGroup,
  TxnItem,
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
  const name = typeof d.attributes.name === 'string' ? d.attributes.name : '';
  const category = typeof d.attributes.category === 'string' ? d.attributes.category : '';
  const costCents = typeof d.attributes.costCents === 'number' ? d.attributes.costCents : undefined;
  return {
    id: d.id,
    title: name || draftTitle(d.itemType, d.attributes) || category || 'Item',
    itemType: d.itemType,
    sourceName: d.sourceCustomerId ? names.get(d.sourceCustomerId) ?? 'Customer' : 'Walk-in',
    ...(d.sourceCustomerId !== undefined ? { sourceCustomerId: d.sourceCustomerId } : {}),
    ...(d.priceCents !== undefined ? { priceCents: d.priceCents } : {}),
    ...(costCents !== undefined ? { costCents } : {}),
    attributes: d.attributes,
    online: d.online,
    status: d.status,
    ...(d.createdAt !== undefined ? { createdAt: d.createdAt } : {}),
    ...(d.posCatalogRef !== undefined ? { posCatalogRef: d.posCatalogRef } : {}),
  };
}

function itemTitle(d: DraftProduct): string {
  const name = typeof d.attributes.name === 'string' ? d.attributes.name : '';
  const category = typeof d.attributes.category === 'string' ? d.attributes.category : '';
  return name || draftTitle(d.itemType, d.attributes) || category || 'Item';
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

  // One draft read, reused for the pending count and to tie each activity row to
  // the items brought in on its transaction (drafts grouped by txnId = sourceRef).
  const allDrafts = await engine.draftRepo.list();
  const openDrafts = allDrafts.filter((d) => d.status !== 'PUSHED');
  const byTxn = new Map<string, DraftProduct[]>();
  for (const d of allDrafts) {
    const k = typeof d.attributes.txnId === 'string' ? d.attributes.txnId : null;
    if (!k) continue;
    const arr = byTxn.get(k) ?? [];
    arr.push(d);
    byTxn.set(k, arr);
  }

  const report = await reconcileDay([], engine.ledgerRepo);
  const recentEntries = await engine.ledgerRepo.listEntries({ limit: 8 });

  return {
    givenTodayCents,
    usedTodayCents,
    salesTodayCents: 0, // populated once the Square sales feed lands (Phase 5)
    outstandingLiabilityCents: report.totals.outstandingLiabilityCents,
    draftsToFinish: openDrafts.length,
    needsAttentionCount: report.unmatched.length + report.negativeBalances.length,
    recent: recentEntries.map((e) => {
      const row = toActivityRow(e, names);
      const items = e.sourceRef ? byTxn.get(e.sourceRef) : undefined;
      if (items && items.length) row.addedItems = items.map((d) => ({ title: itemTitle(d), itemType: d.itemType }));
      return row;
    }),
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

  // Cash paid to sellers + items bought today, from our own draft records
  // (cash buys stash the amount on a stub's attributes.cashPaidCents).
  const since = startOfTodayIso();
  const todayDrafts = (await engine.draftRepo.list()).filter((d) => d.createdAt && d.createdAt >= since);
  let cashCents = 0;
  for (const d of todayDrafts) if (typeof d.attributes.cashPaidCents === 'number') cashCents += d.attributes.cashPaidCents;
  const itemsBought = todayDrafts.length;

  return {
    givenCents,
    usedCents,
    cashCents,
    itemsBought,
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

  // Items grouped by the transaction that took them in — the non-negotiable,
  // read entirely from our own tables. We join the credit-issue entry by its
  // sourceRef (= txnId) for the amount/date; cash buys carry the amount on a
  // stub. Drafts predating txnId fall back to grouping by their created day.
  const issueBySource = new Map<string, (typeof entries)[number]>();
  for (const e of entries) if (e.kind === 'ISSUE' && e.sourceRef) issueBySource.set(e.sourceRef, e);

  const groups = new Map<string, DraftProduct[]>();
  for (const d of drafts) {
    const txnId =
      (typeof d.attributes.txnId === 'string' && d.attributes.txnId) ||
      (d.createdAt ? `day:${d.createdAt.slice(0, 10)}` : `d:${d.id}`);
    const arr = groups.get(txnId) ?? [];
    arr.push(d);
    groups.set(txnId, arr);
  }

  const transactions: TxnGroup[] = [];
  for (const [txnId, ds] of groups) {
    const issue = issueBySource.get(txnId);
    const cashDraft = ds.find((d) => typeof d.attributes.cashPaidCents === 'number');
    const draftDates = ds.map((d) => d.createdAt).filter((s): s is string => !!s).sort();
    const dateIso = issue?.createdAt ?? draftDates[0] ?? new Date(0).toISOString();
    const payout: TxnGroup['payout'] = issue ? 'store_credit' : cashDraft ? 'cash' : 'unknown';
    const amountCents = issue ? issue.deltaCents : cashDraft ? Number(cashDraft.attributes.cashPaidCents) : 0;
    transactions.push({ id: txnId, dateIso, payout, amountCents, items: ds.map(toTxnItem) });
  }
  transactions.sort((a, b) => b.dateIso.localeCompare(a.dateIso)); // newest first

  const firstSeen = [...entries.map((e) => e.createdAt), ...drafts.map((d) => d.createdAt)]
    .filter((s): s is string => !!s)
    .sort()[0];

  return {
    id: customer.id,
    displayName: customer.displayName,
    ...(customer.phone !== undefined ? { phone: customer.phone } : {}),
    balanceCents,
    ...(firstSeen ? { memberSinceIso: firstSeen } : {}),
    history: entries.map((e) => toActivityRow(e, names)),
    transactions,
  };
}

function toTxnItem(d: DraftProduct): TxnItem {
  const a = d.attributes;
  const name = typeof a.name === 'string' ? a.name : '';
  const category = typeof a.category === 'string' ? a.category : '';
  const title = name || category || draftTitle(d.itemType, a);
  // Detail: itemized advanced fields, else a batch count, else a finish hint.
  const adv = ['size', 'condition', 'brand'].map((k) => (typeof a[k] === 'string' ? (a[k] as string) : '')).filter(Boolean);
  const qty = typeof a.qty === 'number' ? a.qty : 0;
  const bits: string[] = [];
  if (adv.length) bits.push(adv.join(' · '));
  else if (qty > 1) bits.push(`${qty} ${(category || 'items').toLowerCase()}`);
  if (d.status !== 'PUSHED' && d.priceCents === undefined) bits.push('not finished');
  const detail = bits.join(' · ');
  return {
    id: d.id,
    title,
    itemType: d.itemType,
    status: d.status === 'PUSHED' ? 'in_stock' : 'pending',
    ...(detail ? { detail } : {}),
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
