import { Cents, DraftProduct, ItemType } from './types';
import { DraftFilter, DraftPatch, DraftRepository } from '../ports/draftRepository';
import { PosAdapter } from '../ports/posAdapter';

/**
 * Drafts: the pending-dashboard flow.
 *
 * A draft starts as a stub from intake (`DRAFT`), gets its attributes/price
 * filled in, is marked `READY`, then pushed into the POS catalog (`PUSHED`),
 * after which it can be toggled online. The status only moves forward.
 */

export interface DraftEdit {
  itemType?: ItemType;
  attributes?: Record<string, unknown>;
  priceCents?: Cents;
}

export class Drafts {
  constructor(private readonly repo: DraftRepository) {}

  list(filter?: DraftFilter): Promise<DraftProduct[]> {
    return this.repo.list(filter);
  }

  /** Fill in attributes/price/type. Attributes are merged, not replaced. Rejects a pushed draft. */
  async edit(id: string, edit: DraftEdit): Promise<DraftProduct> {
    const draft = await this.require(id);
    if (draft.status === 'PUSHED') throw new Error(`Cannot edit a pushed draft: ${id}`);

    const patch: DraftPatch = {};
    if (edit.itemType !== undefined) patch.itemType = edit.itemType;
    if (edit.priceCents !== undefined) patch.priceCents = edit.priceCents;
    if (edit.attributes !== undefined) patch.attributes = { ...draft.attributes, ...edit.attributes };
    return this.repo.update(id, patch);
  }

  /** Mark a draft ready to push. Idempotent if already `READY`; rejects a pushed draft. */
  async markReady(id: string): Promise<DraftProduct> {
    const draft = await this.require(id);
    if (draft.status === 'PUSHED') throw new Error(`Cannot re-ready a pushed draft: ${id}`);
    return this.repo.update(id, { status: 'READY' });
  }

  /**
   * Push a `READY` draft into the POS catalog via the adapter, then store the
   * returned catalog ref and flip the draft to `PUSHED`.
   */
  async pushToPos(id: string, pos: PosAdapter): Promise<DraftProduct> {
    const draft = await this.require(id);
    if (draft.status !== 'READY') {
      throw new Error(`Draft must be READY to push, is ${draft.status}: ${id}`);
    }
    const { externalId } = await pos.pushProduct(draft);
    return this.repo.update(id, { status: 'PUSHED', posCatalogRef: externalId });
  }

  /** Toggle whether a draft is listed online. */
  setOnline(id: string, online: boolean): Promise<DraftProduct> {
    return this.repo.update(id, { online });
  }

  private async require(id: string): Promise<DraftProduct> {
    const draft = await this.repo.get(id);
    if (!draft) throw new Error(`Draft not found: ${id}`);
    return draft;
  }
}
