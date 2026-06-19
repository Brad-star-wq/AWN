import { PosAdapter } from '../ports/posAdapter';
import { DraftProduct, SaleEvent, TenderType } from '../domain/types';

/**
 * A raw mock POS payload — deliberately *not* a SaleEvent.
 *
 * This is the shape a hypothetical POS would put on the wire (snake_case,
 * its own tender vocabulary). The adapter's job is to normalize it into the
 * engine's `SaleEvent`. Keeping the raw shape distinct is the whole point of
 * the seam: the Square adapter will map a Square payload into the same
 * `SaleEvent`, and the engine never learns which POS it came from.
 */
export interface MockTenderPayload {
  method: 'card' | 'cash' | 'store_credit' | 'other';
  amount_cents: number;
  note?: string;
}

export interface MockOrderPayload {
  /** Maps to SaleEvent.eventId — the idempotency anchor. */
  id: string;
  order_id: string;
  /** POS customer id, absent on an anonymous sale. */
  customer_id?: string;
  created_at: string;
  tenders: MockTenderPayload[];
}

const TENDER_TYPE: Record<MockTenderPayload['method'], TenderType> = {
  card: 'CARD',
  cash: 'CASH',
  store_credit: 'STORE_CREDIT',
  other: 'OTHER',
};

function isMockOrderPayload(payload: unknown): payload is MockOrderPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.order_id === 'string' &&
    typeof p.created_at === 'string' &&
    Array.isArray(p.tenders)
  );
}

/**
 * In-memory POS used by tests, the demo, and local development.
 *
 * It implements the same `PosAdapter` port the Square adapter will, so the
 * full pull → apply path runs end-to-end with zero Square dependency. Seeded
 * orders are stored as *raw* payloads and run through `normalizeWebhook`, so
 * both the webhook path and the `fetchSalesSince` catch-up path exercise the
 * exact same normalization.
 */
export class MockPosAdapter implements PosAdapter {
  private orders: MockOrderPayload[] = [];
  private catalog = new Map<string, DraftProduct>();
  private catalogSeq = 0;

  /** Seed the in-memory POS with a day's raw orders. */
  seedOrders(orders: MockOrderPayload[]): void {
    this.orders.push(...orders);
  }

  normalizeWebhook(payload: unknown): SaleEvent | null {
    if (!isMockOrderPayload(payload)) return null;

    const tenders = payload.tenders.map((t) => ({
      type: TENDER_TYPE[t.method],
      amountCents: t.amount_cents,
      ...(t.note !== undefined ? { note: t.note } : {}),
    }));

    return {
      eventId: payload.id,
      orderRef: payload.order_id,
      ...(payload.customer_id !== undefined ? { customerRef: payload.customer_id } : {}),
      occurredAt: payload.created_at,
      tenders,
    };
  }

  async fetchSalesSince(sinceIso: string): Promise<SaleEvent[]> {
    return this.orders
      .filter((o) => o.created_at >= sinceIso)
      .map((o) => this.normalizeWebhook(o))
      .filter((e): e is SaleEvent => e !== null);
  }

  async pushProduct(draft: DraftProduct): Promise<{ externalId: string }> {
    const externalId = `mock_cat_${++this.catalogSeq}`;
    this.catalog.set(externalId, { ...draft, posCatalogRef: externalId });
    return { externalId };
  }

  /** Test/demo helper: the items pushed into the mock catalog. */
  catalogItems(): readonly DraftProduct[] {
    return [...this.catalog.values()];
  }
}
