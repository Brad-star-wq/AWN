import { Cents, DraftProduct, DraftStatus, ItemType } from '../domain/types';

/** The fields captured when a draft stub is first created at intake. */
export interface NewDraft {
  sourceCustomerId?: string;
  itemType: ItemType;
  attributes?: Record<string, unknown>;
  priceCents?: Cents;
}

/** A partial update to a draft. Only the mutable fields are patchable. */
export type DraftPatch = Partial<
  Pick<DraftProduct, 'itemType' | 'attributes' | 'priceCents' | 'status' | 'online' | 'posCatalogRef'>
>;

export interface DraftFilter {
  status?: DraftStatus;
  sourceCustomerId?: string;
}

/**
 * Storage contract for draft products — the pending pile between intake and a
 * finished catalog listing. A draft is born `DRAFT`, completed to `READY`, and
 * `PUSHED` once it lands in the POS catalog.
 */
export interface DraftRepository {
  create(input: NewDraft): Promise<DraftProduct>;
  get(id: string): Promise<DraftProduct | null>;
  list(filter?: DraftFilter): Promise<DraftProduct[]>;
  /** Apply a partial update and return the new state. Throws if the id is unknown. */
  update(id: string, patch: DraftPatch): Promise<DraftProduct>;
}
