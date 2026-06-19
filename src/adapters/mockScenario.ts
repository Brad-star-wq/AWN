import { Cents, Customer } from '../domain/types';
import { MockOrderPayload } from './mockPosAdapter';

/**
 * A scripted, deterministic "day at the shop" for tests and the demo.
 *
 * It is the single source of truth for both halves of the scenario: the
 * customers that exist (so the ledger and the POS agree on who is known) and
 * the raw POS orders that come across the wire. Timestamps are fixed so runs
 * are reproducible — no wall-clock, no randomness.
 */

export interface ScenarioCustomer {
  customer: Customer;
  /** Credit issued at open of day (a prior intake), so redemptions have something to draw from. */
  openingCreditCents: Cents;
}

export interface RealisticDay {
  customers: ScenarioCustomer[];
  orders: MockOrderPayload[];
}

const DAY = '2026-06-18';
const at = (hhmm: string) => `${DAY}T${hhmm}:00.000-04:00`;

/** A POS customer ref present on a sale but NOT in our books — surfaces as unmatched. */
export const UNKNOWN_POS_REF = 'sq_ghost';

export function buildRealisticDay(): RealisticDay {
  const customers: ScenarioCustomer[] = [
    {
      customer: { id: 'cust_marcus', displayName: 'Marcus T.', posCustomerRef: 'sq_marcus' },
      openingCreditCents: 5000,
    },
    {
      customer: { id: 'cust_priya', displayName: 'Priya N.', posCustomerRef: 'sq_priya' },
      openingCreditCents: 3000,
    },
  ];

  const orders: MockOrderPayload[] = [
    // 1. Named STORE_CREDIT tender → APPLIED (Marcus redeems 2000).
    {
      id: 'evt_sc_marcus',
      order_id: 'ord_1001',
      customer_id: 'sq_marcus',
      created_at: at('10:15'),
      tenders: [
        { method: 'store_credit', amount_cents: 2000 },
        { method: 'card', amount_cents: 1500 },
      ],
    },
    // 2. OTHER + note "Store Credit" (the Square shape) → APPLIED (Priya redeems 1500).
    {
      id: 'evt_sc_priya',
      order_id: 'ord_1002',
      customer_id: 'sq_priya',
      created_at: at('11:30'),
      tenders: [
        { method: 'other', amount_cents: 1500, note: 'Store Credit' },
        { method: 'card', amount_cents: 500 },
      ],
    },
    // 3. Card-only sale → IGNORED (no store-credit tender to act on).
    {
      id: 'evt_card_only',
      order_id: 'ord_1003',
      customer_id: 'sq_marcus',
      created_at: at('12:05'),
      tenders: [{ method: 'card', amount_cents: 4200 }],
    },
    // 4. Store-credit sale with no customer attached → UNMATCHED (no-customer-on-sale).
    {
      id: 'evt_no_customer',
      order_id: 'ord_1004',
      created_at: at('14:20'),
      tenders: [{ method: 'store_credit', amount_cents: 1000 }],
    },
    // 5. Store-credit sale for a customer we don't have → UNMATCHED (customer-not-found).
    {
      id: 'evt_unknown_customer',
      order_id: 'ord_1005',
      customer_id: UNKNOWN_POS_REF,
      created_at: at('15:45'),
      tenders: [{ method: 'store_credit', amount_cents: 1200 }],
    },
    // 6. Duplicate of order #1 (replayed webhook / catch-up pull) → IGNORED, deducts once.
    {
      id: 'evt_sc_marcus',
      order_id: 'ord_1001',
      customer_id: 'sq_marcus',
      created_at: at('10:15'),
      tenders: [
        { method: 'store_credit', amount_cents: 2000 },
        { method: 'card', amount_cents: 1500 },
      ],
    },
  ];

  return { customers, orders };
}
