'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Customer } from '@engine/domain/types';
import { createIntake } from '@engine/domain/intake';
import { OverdrawError } from '@engine/domain/ledger';
import type { DraftEdit } from '@engine/domain/drafts';
import { squareClientFromEnv } from '@engine/adapters/square/squareClient';
import { SquareCatalogAdapter } from '@engine/adapters/square/squareCatalog';
import { engine } from '@/lib/server/engine';
import { requireOwner } from '@/lib/server/auth';
import { searchCustomers, getAttributionQueue } from '@/lib/server/queries';
import { finalizeRedemption, reassignRedemption } from '@/lib/server/redemptions/finalize';
import {
  getIntakeOptions,
  addIntakeOption as addIntakeOptionDb,
  removeIntakeOption as removeIntakeOptionDb,
  isOptionKind,
} from '@/lib/server/intake-options';
import type { IntakeOptions } from '@/lib/categories';
import type { CustomerPick, ItemType, RedemptionQueueItem } from '@/lib/types';

/** Client-callable wrapper for the customer typeahead (intake / redeem). */
export async function searchCustomersAction(query: string): Promise<CustomerPick[]> {
  return searchCustomers(query);
}

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function refreshAll() {
  revalidatePath('/');
  revalidatePath('/customers');
  revalidatePath('/drafts');
  revalidatePath('/inventory');
  revalidatePath('/eod');
  revalidatePath('/redeem');
}

// ---- Intake ----------------------------------------------------------------

export interface IntakeItemInput {
  itemType: ItemType;
  attributes: Record<string, unknown>;
  /** What the shop pays for this item — sums into the credit issued. Integer cents. */
  payoutCents: number;
}

export interface IntakeInput {
  customerId?: string;
  displayName?: string;
  phone?: string;
  payout: 'store_credit' | 'cash';
  items: IntakeItemInput[];
}

async function resolveCashCustomer(input: IntakeInput): Promise<Customer> {
  const phone = input.phone?.trim();
  if (phone) {
    const existing = await engine.customers.findByPhone(phone);
    if (existing) return existing;
  }
  return engine.customers.create({ displayName: input.displayName!.trim(), ...(phone ? { phone } : {}) });
}

export async function intakeCreate(input: IntakeInput): Promise<ActionResult<{ customerId: string }>> {
  await requireOwner();

  if (input.items.length === 0) return { ok: false, error: 'Add at least one item.' };
  let totalCents = 0;
  for (const it of input.items) {
    if (!Number.isInteger(it.payoutCents) || it.payoutCents <= 0) {
      return { ok: false, error: 'Each item needs a price in whole cents.' };
    }
    totalCents += it.payoutCents;
  }
  if (!input.customerId && !input.displayName?.trim()) {
    return { ok: false, error: 'Pick an existing customer or enter a name.' };
  }

  const txnId = randomUUID(); // groups these items as one transaction on the profile

  if (input.payout === 'store_credit') {
    const phone = input.phone?.trim();
    const res = await createIntake(
      {
        customer: input.customerId
          ? { id: input.customerId }
          : { displayName: input.displayName!.trim(), ...(phone ? { phone } : {}) },
        creditCents: totalCents,
        items: input.items.map((it) => ({ itemType: it.itemType, attributes: { ...it.attributes, txnId, costCents: it.payoutCents } })),
        note: 'Intake — store credit',
        idempotencyKey: txnId,
      },
      { ledger: engine.ledger, customers: engine.customers, drafts: engine.draftRepo },
    );
    refreshAll();
    return { ok: true, customerId: res.customer.id };
  }

  // Cash payout: record the customer + draft stubs, but post no store credit.
  const customer = input.customerId
    ? await engine.customers.getCustomer(input.customerId)
    : await resolveCashCustomer(input);
  if (!customer) return { ok: false, error: 'Customer not found.' };
  for (const it of input.items) {
    await engine.draftRepo.create({ sourceCustomerId: customer.id, itemType: it.itemType, attributes: { ...it.attributes, txnId, costCents: it.payoutCents } });
  }
  refreshAll();
  return { ok: true, customerId: customer.id };
}

// ---- In-store buy (tap-to-increment) ---------------------------------------
//
// The in-store engine is "everything optional": the credit (or cash) paid is an
// explicit paying-out total, NOT derived from item prices, and items may be
// unpriced category stubs. This maps onto the SAME domain `createIntake`, which
// already takes `creditCents` explicitly and price-optional item stubs — so no
// engine change is needed. We never auto-split a line's group total across its
// items; that total only feeds the paying-out figure the owner committed.

export interface BuySlotInput {
  name?: string;
  priceCents?: number;
  /** Scaled-down advanced detail (size/condition/brand) + free note. */
  attributes?: Record<string, unknown>;
}
export interface BuyLineInput {
  itemType: ItemType;
  /** Display label (e.g. "Clothing") kept on the stub since itemType is coarse. */
  category: string;
  qty: number;
  slots?: BuySlotInput[];
}

export async function buyCreate(input: {
  customerId?: string;
  displayName?: string;
  phone?: string;
  payout: 'store_credit' | 'cash';
  /** The paying-out total (credit issued, or cash paid) — explicit, integer cents. */
  payoutCents: number;
  lines: BuyLineInput[];
  /** Per-buy key so a double-tapped "Load" can't double-post the credit. */
  idempotencyKey?: string;
}): Promise<ActionResult<{ customerId: string; balanceCents: number }>> {
  await requireOwner();
  if (!Number.isInteger(input.payoutCents) || input.payoutCents <= 0) {
    return { ok: false, error: 'Enter how much you are paying out.' };
  }
  if (!input.customerId && !input.displayName?.trim()) {
    return { ok: false, error: 'Pick a customer or enter a name.' };
  }

  // One transaction id stamped on every stub (and used as the credit-issue key),
  // so the profile can group "items by transaction" off our own tables.
  const txnId = input.idempotencyKey ?? randomUUID();

  // Each itemized slot persists as one draft (the addressable individual); any
  // remaining un-itemized count persists as ONE batch draft. A slot's price is
  // the buy-in COST (stored in attributes.costCents — the list price is set
  // later in the finish form); a group total is never split across items.
  const stubs: Array<{ itemType: ItemType; attributes: Record<string, unknown> }> = [];
  for (const line of input.lines) {
    const slots = line.slots ?? [];
    for (const slot of slots) {
      const attributes: Record<string, unknown> = { category: line.category, txnId, ...(slot.attributes ?? {}) };
      if (slot.name) attributes.name = slot.name;
      if (slot.priceCents !== undefined) attributes.costCents = slot.priceCents;
      stubs.push({ itemType: line.itemType, attributes });
    }
    const remainder = Math.max(0, Math.floor(line.qty) - slots.length);
    if (remainder > 0) {
      stubs.push({ itemType: line.itemType, attributes: { category: line.category, qty: remainder, txnId } });
    }
  }

  // In-store buys are physical goods, so a lump buy with no category taps still
  // leaves one "Other" pending stub — it appears in the queue to itemize /
  // photograph later (the "no time" scenario). Pure zero-item credit issuance
  // (migration / starting balance) is a People-screen concern, not the buy flow.
  if (stubs.length === 0) stubs.push({ itemType: 'OTHER', attributes: { category: 'Other', txnId } });

  const phone = input.phone?.trim();

  if (input.payout === 'store_credit') {
    const res = await createIntake(
      {
        customer: input.customerId
          ? { id: input.customerId }
          : { displayName: input.displayName!.trim(), ...(phone ? { phone } : {}) },
        creditCents: input.payoutCents,
        items: stubs,
        note: 'In-store buy — store credit',
        idempotencyKey: txnId,
      },
      { ledger: engine.ledger, customers: engine.customers, drafts: engine.draftRepo },
    );
    refreshAll();
    const balanceCents = await engine.ledger.getBalance(res.customer.id);
    return { ok: true, customerId: res.customer.id, balanceCents };
  }

  // Cash payout: post no credit, but the buy MUST be logged (guardrail). We
  // record the item stubs and stash the cash amount on a stub's attributes so
  // End of Day can total it. (A first-class cash-payout record would be a
  // cleaner home — flagged for the EOD phase; this avoids an engine change.)
  const customer = input.customerId
    ? await engine.customers.getCustomer(input.customerId)
    : await resolveCashCustomer({ payout: 'cash', items: [], displayName: input.displayName, ...(phone ? { phone } : {}) });
  if (!customer) return { ok: false, error: 'Customer not found.' };

  stubs[0]!.attributes.cashPaidCents = input.payoutCents;
  for (const s of stubs) {
    await engine.draftRepo.create({ sourceCustomerId: customer.id, itemType: s.itemType, attributes: s.attributes });
  }
  refreshAll();
  const balanceCents = await engine.ledger.getBalance(customer.id);
  return { ok: true, customerId: customer.id, balanceCents };
}

// One detailed item taken in through the full intake/finish form. Issues credit
// (or logs cash) AND creates a single richly-detailed draft in one step — the
// "Save & issue credit" path. Catalog push stays a separate, later action.
export async function intakeItemCreate(input: {
  customerId?: string;
  displayName?: string;
  phone?: string;
  payout: 'store_credit' | 'cash';
  /** The price the shop is paying (cost / credit issued), integer cents. */
  costCents: number;
  /** Optional list price already decided at intake. */
  listPriceCents?: number;
  itemType: ItemType;
  attributes: Record<string, unknown>;
}): Promise<ActionResult<{ customerId: string; balanceCents: number; draftId: string }>> {
  await requireOwner();
  if (!Number.isInteger(input.costCents) || input.costCents <= 0) {
    return { ok: false, error: 'Enter the price you’re paying.' };
  }
  if (!input.customerId && !input.displayName?.trim()) {
    return { ok: false, error: 'Pick a customer or enter a name.' };
  }
  const txnId = randomUUID();
  const phone = input.phone?.trim();
  const attributes = { ...input.attributes, txnId, costCents: input.costCents };

  if (input.payout === 'store_credit') {
    const res = await createIntake(
      {
        customer: input.customerId ? { id: input.customerId } : { displayName: input.displayName!.trim(), ...(phone ? { phone } : {}) },
        creditCents: input.costCents,
        items: [{ itemType: input.itemType, attributes, ...(input.listPriceCents !== undefined ? { priceCents: input.listPriceCents } : {}) }],
        note: 'Intake — store credit',
        idempotencyKey: txnId,
      },
      { ledger: engine.ledger, customers: engine.customers, drafts: engine.draftRepo },
    );
    refreshAll();
    return { ok: true, customerId: res.customer.id, balanceCents: await engine.ledger.getBalance(res.customer.id), draftId: res.drafts[0]?.id ?? '' };
  }

  const customer = input.customerId
    ? await engine.customers.getCustomer(input.customerId)
    : await resolveCashCustomer({ payout: 'cash', items: [], displayName: input.displayName, ...(phone ? { phone } : {}) });
  if (!customer) return { ok: false, error: 'Customer not found.' };
  const draft = await engine.draftRepo.create({
    sourceCustomerId: customer.id,
    itemType: input.itemType,
    attributes: { ...attributes, cashPaidCents: input.costCents },
    ...(input.listPriceCents !== undefined ? { priceCents: input.listPriceCents } : {}),
  });
  refreshAll();
  return { ok: true, customerId: customer.id, balanceCents: await engine.ledger.getBalance(customer.id), draftId: draft.id };
}

// ---- Credit ----------------------------------------------------------------

export async function redeemCredit(input: {
  customerId: string;
  amountCents: number;
}): Promise<ActionResult<{ balanceCents: number }>> {
  await requireOwner();
  if (!input.customerId) return { ok: false, error: 'Pick a customer.' };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' };
  }

  try {
    // App-first: cap at the balance and reject an overdraw.
    await engine.ledger.redeemCredit({
      customerId: input.customerId,
      amountCents: input.amountCents,
      enforceBalance: true,
      sourceRef: 'dashboard-redeem',
      note: 'Redeemed via dashboard (app-first)',
    });
  } catch (err) {
    if (err instanceof OverdrawError) return { ok: false, error: 'That is more than the available balance.' };
    throw err;
  }

  const balanceCents = await engine.ledger.getBalance(input.customerId);
  refreshAll();
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true, balanceCents };
}

// ---- Redemptions (v2, attribute-on-arrival) --------------------------------

/** Poll fallback for the live attribution queue when Realtime isn't delivering. */
export async function getAttributionQueueAction(): Promise<RedemptionQueueItem[]> {
  return getAttributionQueue();
}

/**
 * Assign an unattributed redemption to a customer and finalize it (Phase E's
 * action, surfaced from the Phase D queue). Origin-agnostic: it just resolves
 * the customer and calls the shared `finalizeRedemption` spine. Over-balance
 * returns `needsConfirm` (the UI shows the available credit and asks); resend
 * with `confirmNegative` to finalize with a `negative_balance` flag.
 *
 * We follow the app's Server-Action idiom rather than a REST route (every other
 * mutation here is a Server Action) — same authenticated, revalidating path.
 */
export async function attributeRedemption(input: {
  redemptionId: string;
  customerId?: string;
  displayName?: string;
  phone?: string;
  confirmNegative?: boolean;
}): Promise<
  ActionResult<
    | { balanceCents: number; negativeBalance: boolean }
    | { needsConfirm: true; available: number }
  >
> {
  await requireOwner();

  const row = await engine.redemptions.getById(input.redemptionId);
  if (!row) return { ok: false, error: 'Redemption not found.' };
  if (row.status !== 'awaiting_attribution') {
    return { ok: false, error: 'This redemption is no longer awaiting assignment.' };
  }

  // Resolve the customer — an existing id, or a new customer by name (+ phone).
  let customerId = input.customerId;
  if (!customerId) {
    const name = input.displayName?.trim();
    if (!name) return { ok: false, error: 'Pick a customer or enter a name.' };
    const phone = input.phone?.trim();
    const existing = phone ? await engine.customers.findByPhone(phone) : null;
    const customer = existing ?? (await engine.customers.create({ displayName: name, ...(phone ? { phone } : {}) }));
    customerId = customer.id;
  }

  const res = await finalizeRedemption({
    redemptionId: row.id,
    customerId,
    amountCents: row.amountCents,
    squarePaymentId: row.squarePaymentId,
    origin: row.origin,
    allowNegative: !!input.confirmNegative,
  });

  if (!res.ok) return { ok: true, needsConfirm: true, available: res.available };

  const balanceCents = await engine.ledger.getBalance(customerId);
  refreshAll();
  revalidatePath('/store');
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, balanceCents, negativeBalance: res.negativeBalance };
}

/**
 * Reassign a wrong-customer redemption: append a reversal to the wrongly-charged
 * customer and return the row to the attribution queue (so the right customer
 * can be assigned). Append-only — the original REDEEM is never edited or deleted.
 */
export async function reassignRedemptionAction(
  redemptionId: string,
): Promise<ActionResult<{ requeued: true }>> {
  await requireOwner();
  const before = await engine.redemptions.getById(redemptionId);
  try {
    await reassignRedemption(redemptionId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reassign.' };
  }
  refreshAll();
  revalidatePath('/store');
  if (before?.customerId) revalidatePath(`/customers/${before.customerId}`);
  return { ok: true, requeued: true };
}

export async function adjustCredit(input: {
  customerId: string;
  amountCents: number;
  note?: string;
}): Promise<ActionResult<{ balanceCents: number }>> {
  await requireOwner();
  if (!input.customerId) return { ok: false, error: 'Pick a customer.' };
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    return { ok: false, error: 'Enter a non-zero amount (negative to deduct).' };
  }

  await engine.ledger.adjustCredit({
    customerId: input.customerId,
    amountCents: input.amountCents,
    ...(input.note ? { note: input.note } : {}),
  });
  const balanceCents = await engine.ledger.getBalance(input.customerId);
  refreshAll();
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true, balanceCents };
}

// ---- Settings → Square category sync ---------------------------------------
// The only Square write the redesign owns. Goes through the dedicated catalog
// adapter (NOT the POS MockPosAdapter), version-pinned + 429-retried. Gated on a
// token; defaults to Sandbox (squareClientFromEnv), never production unless
// SQUARE_ENV=production. No token → a clear message, no call.
export async function syncCategoryToSquare(
  name: string,
): Promise<ActionResult<{ externalId: string; version: number }>> {
  await requireOwner();
  if (!name.trim()) return { ok: false, error: 'Enter a category name.' };
  let client;
  try {
    client = squareClientFromEnv();
  } catch {
    return { ok: false, error: 'Square not configured — add a sandbox token with ITEMS_WRITE to sync categories.' };
  }
  try {
    const res = await new SquareCatalogAdapter(client).upsertCategory({ name: name.trim() });
    return { ok: true, externalId: res.externalId, version: res.version };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Category sync failed.' };
  }
}

// ---- Customers -------------------------------------------------------------

export async function customerCreate(input: {
  displayName: string;
  phone?: string;
}): Promise<ActionResult<{ customerId: string }>> {
  await requireOwner();
  if (!input.displayName.trim()) return { ok: false, error: 'Enter a name.' };
  const phone = input.phone?.trim();
  const c = await engine.customers.create({ displayName: input.displayName.trim(), ...(phone ? { phone } : {}) });
  refreshAll();
  return { ok: true, customerId: c.id };
}

// ---- Drafts ----------------------------------------------------------------

export async function draftEdit(input: {
  id: string;
  itemType?: ItemType;
  attributes?: Record<string, unknown>;
  priceCents?: number;
}): Promise<ActionResult> {
  await requireOwner();
  if (input.priceCents !== undefined && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) {
    return { ok: false, error: 'Price must be a whole number of cents.' };
  }
  const edit: DraftEdit = {};
  if (input.itemType) edit.itemType = input.itemType;
  if (input.attributes) edit.attributes = input.attributes;
  if (input.priceCents !== undefined) edit.priceCents = input.priceCents;
  try {
    await engine.drafts.edit(input.id, edit);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not edit draft.' };
  }
  refreshAll();
  return { ok: true };
}

export async function draftMarkReady(id: string): Promise<ActionResult> {
  await requireOwner();
  try {
    await engine.drafts.markReady(id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not mark ready.' };
  }
  refreshAll();
  return { ok: true };
}

export async function draftSetOnline(id: string, online: boolean): Promise<ActionResult> {
  await requireOwner();
  await engine.drafts.setOnline(id, online);
  refreshAll();
  return { ok: true };
}

/** Push one draft to the catalog via the MOCK adapter (Square is Phase 5). */
export async function draftPush(id: string): Promise<ActionResult> {
  await requireOwner();
  try {
    const draft = await engine.draftRepo.get(id);
    if (!draft) return { ok: false, error: 'Draft not found.' };
    if (draft.status === 'DRAFT') await engine.drafts.markReady(id);
    await engine.drafts.pushToPos(id, engine.pos);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not push draft.' };
  }
  refreshAll();
  return { ok: true };
}

export async function draftsBulkPush(ids: string[]): Promise<ActionResult<{ pushed: number }>> {
  await requireOwner();
  let pushed = 0;
  for (const id of ids) {
    const draft = await engine.draftRepo.get(id);
    if (!draft || draft.status === 'PUSHED') continue;
    if (draft.status === 'DRAFT') await engine.drafts.markReady(id);
    await engine.drafts.pushToPos(id, engine.pos);
    pushed += 1;
  }
  refreshAll();
  return { ok: true, pushed };
}

// ---- Intake options (Settings CRUD) ---------------------------------------

/** Client-callable read: the intake/finish forms load live options with this. */
export async function getIntakeOptionsAction(): Promise<IntakeOptions> {
  return getIntakeOptions();
}

function normalizeOption(kind: string, category: string, value: string):
  | { error: string }
  | { kind: 'category' | 'brand' | 'condition' | 'size' | 'color'; category: string; value: string } {
  if (!isOptionKind(kind)) return { error: 'Unknown option list.' };
  const v = value.trim();
  if (!v) return { error: 'Enter a value.' };
  const cat = kind === 'category' ? '' : category.trim();
  if (kind !== 'category' && !cat) return { error: 'Missing category.' };
  return { kind, category: cat, value: v };
}

function revalidateOptions() {
  revalidatePath('/intake');
  revalidatePath('/drafts');
  revalidatePath('/inventory');
  revalidatePath('/settings');
}

export async function addIntakeOptionAction(input: { kind: string; category?: string; value: string }): Promise<ActionResult> {
  await requireOwner();
  const n = normalizeOption(input.kind, input.category ?? '', input.value);
  if ('error' in n) return { ok: false, error: n.error };
  try {
    await addIntakeOptionDb(n.kind, n.category, n.value);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add option.' };
  }
  revalidateOptions();
  return { ok: true };
}

export async function removeIntakeOptionAction(input: { kind: string; category?: string; value: string }): Promise<ActionResult> {
  await requireOwner();
  const n = normalizeOption(input.kind, input.category ?? '', input.value);
  if ('error' in n) return { ok: false, error: n.error };
  try {
    await removeIntakeOptionDb(n.kind, n.category, n.value);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not remove option.' };
  }
  revalidateOptions();
  return { ok: true };
}
