'use server';

import { revalidatePath } from 'next/cache';
import type { Customer } from '@engine/domain/types';
import { createIntake } from '@engine/domain/intake';
import { OverdrawError } from '@engine/domain/ledger';
import type { DraftEdit } from '@engine/domain/drafts';
import { engine } from '@/lib/server/engine';
import { requireOwner } from '@/lib/server/auth';
import { searchCustomers } from '@/lib/server/queries';
import type { CustomerPick, ItemType } from '@/lib/types';

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

  if (input.payout === 'store_credit') {
    const phone = input.phone?.trim();
    const res = await createIntake(
      {
        customer: input.customerId
          ? { id: input.customerId }
          : { displayName: input.displayName!.trim(), ...(phone ? { phone } : {}) },
        creditCents: totalCents,
        items: input.items.map((it) => ({ itemType: it.itemType, attributes: it.attributes })),
        note: 'Intake — store credit',
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
    await engine.draftRepo.create({ sourceCustomerId: customer.id, itemType: it.itemType, attributes: it.attributes });
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

  // Expand each line into qty stubs; slot detail/price rides on the first
  // slots, the rest are bare category stubs. Prices are never auto-split.
  const stubs: Array<{ itemType: ItemType; attributes: Record<string, unknown>; priceCents?: number }> = [];
  for (const line of input.lines) {
    const qty = Math.max(1, Math.floor(line.qty));
    for (let i = 0; i < qty; i++) {
      const slot = line.slots?.[i];
      const attributes: Record<string, unknown> = { category: line.category, ...(slot?.attributes ?? {}) };
      if (slot?.name) attributes.name = slot.name;
      stubs.push({
        itemType: line.itemType,
        attributes,
        ...(slot?.priceCents !== undefined ? { priceCents: slot.priceCents } : {}),
      });
    }
  }

  // In-store buys are physical goods, so a lump buy with no category taps still
  // leaves one "Other" pending stub — it appears in the queue to itemize /
  // photograph later (the "no time" scenario). Pure zero-item credit issuance
  // (migration / starting balance) is a People-screen concern, not the buy flow.
  if (stubs.length === 0) stubs.push({ itemType: 'OTHER', attributes: { category: 'Other' } });

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
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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
    await engine.draftRepo.create({ sourceCustomerId: customer.id, itemType: s.itemType, attributes: s.attributes, ...(s.priceCents !== undefined ? { priceCents: s.priceCents } : {}) });
  }
  refreshAll();
  const balanceCents = await engine.ledger.getBalance(customer.id);
  return { ok: true, customerId: customer.id, balanceCents };
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
