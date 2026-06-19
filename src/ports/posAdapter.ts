import { DraftProduct, SaleEvent } from '../domain/types';

/**
 * The POS seam.
 *
 * Every point-of-sale backend implements this. The engine talks only to
 * this interface, so the same engine runs against the mock adapter (tests
 * and local development) and the real Square adapter (production) without
 * changing a line of domain logic.
 */
export interface PosAdapter {
  /**
   * Translate a raw POS webhook payload into a normalized SaleEvent,
   * or null if the payload isn't a sale the engine cares about.
   */
  normalizeWebhook(payload: unknown): SaleEvent | null;

  /**
   * Catch-up pull: fetch sales since a timestamp, normalized.
   * This is the reconciliation backstop for any webhook that was missed.
   */
  fetchSalesSince(sinceIso: string): Promise<SaleEvent[]>;

  /**
   * Push a finalized draft into the POS catalog.
   * Returns the external catalog id to store back on the draft.
   */
  pushProduct(draft: DraftProduct): Promise<{ externalId: string }>;
}
