import 'server-only';

import type { RedemptionOrigin } from '@engine/ports/redemptionRepository';

/**
 * SEAM for idea 2 — in-app itemized store-credit checkout. STUB ONLY.
 *
 * Idea 2 is the deterministic sibling of idea 1: instead of the owner ringing
 * the OTHER tender on Square and a human attributing it, the APP builds the
 * Square order and records an EXTERNAL payment, so the customer is known at
 * creation and there is no webhook matching and no attribution step.
 *
 * The whole point of the redemption v2 spine is that this drops in with NO
 * rework: the `app_external_payment` origin already exists, and
 * `finalizeRedemption` is origin-agnostic — idea 2 calls the exact same spine.
 * The line below is a compile-time proof that the origin is already supported;
 * `finalizeRedemption` requires zero changes.
 */
const IDEA_2_ORIGIN: RedemptionOrigin = 'app_external_payment';

/**
 * Line items for an in-app itemized checkout. Sales must be itemized, so the
 * first-class shape is a reference to a Square catalog item (inventory + tax are
 * then Square-native); an ad-hoc line is the fallback for non-cataloged goods.
 * Defined now so the eventual checkout UI and order builder share one shape.
 */
export interface CatalogLineItem {
  kind: 'catalog';
  /** Square catalog object id (ITEM_VARIATION). Square decrements inventory + taxes it. */
  catalogObjectId: string;
  quantity: number;
}

export interface AdHocLineItem {
  kind: 'adhoc';
  name: string;
  amountCents: number;
  /** Optional tax for the ad-hoc line (cataloged items carry their own tax). */
  taxCents?: number;
}

export type InAppLineItem = CatalogLineItem | AdHocLineItem;

export interface CreateInAppRedemptionInput {
  customerId: string;
  lineItems: InAppLineItem[];
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

/**
 * TODO(idea-2): in-app itemized store-credit checkout — deterministic, no
 * attribution needed. Not built now; do NOT make Square write calls, do NOT flip
 * MockPosAdapter.
 *
 * createInAppRedemption({ customerId, lineItems }):
 *   1. Build a Square ORDER (Orders API CreateOrder): itemized catalog line
 *      items + taxes + customer_id. Itemization is first-class here → Square
 *      decrements inventory & captures tax on the order.
 *   2. Record an EXTERNAL payment (Payments API CreatePayment):
 *        source_id: "EXTERNAL",
 *        external_details: { type: "STORED_BALANCE", source: "In-app store credit" },
 *        customer_id, order_id, amount_money = order total (must match exactly).
 *   3. On success, immediately call the SAME spine — no webhook, no attribution:
 *        finalizeRedemption({
 *          customerId, amountCents, squarePaymentId: <payment.id>,
 *          squareOrderId: <order.id>, origin: IDEA_2_ORIGIN,
 *          allowNegative: false,  // balance is capped in-app BEFORE creating the order
 *        })
 *   Deterministic: we own order_id + payment_id from the responses → no webhook
 *   matching, no attribution step.
 *
 * TODO(idea-2): REAL SQUARE WRITE ADAPTER (seam, not built). Idea 2 needs a real
 * Square Orders/Payments client — a sibling to the existing catalog adapter
 * (src/adapters/square/squareCatalog.ts) — plus OAuth scopes ORDERS_WRITE +
 * PAYMENTS_WRITE. This is the point where a real adapter replaces the mock for
 * the *sales* path. It stays sandbox-gated (SQUARE_ENV) exactly like the catalog
 * sync; production writes are never the default. Do NOT wire it here.
 */
export async function createInAppRedemption(
  _input: CreateInAppRedemptionInput,
): Promise<never> {
  void IDEA_2_ORIGIN; // referenced so the origin-support proof isn't tree-shaken away
  throw new NotImplementedError(
    'createInAppRedemption is the idea-2 seam and is not implemented yet.',
  );
}
