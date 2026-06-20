import { DraftProduct } from '../domain/types';
import { DraftFilter, DraftPatch, DraftRepository, NewDraft } from '../ports/draftRepository';

/** In-memory draft store for tests, the demo, and local development. */
export class InMemoryDraftRepository implements DraftRepository {
  private drafts = new Map<string, DraftProduct>();
  private seq = 0;

  async create(input: NewDraft): Promise<DraftProduct> {
    const draft: DraftProduct = {
      id: `draft_${++this.seq}`,
      ...(input.sourceCustomerId !== undefined ? { sourceCustomerId: input.sourceCustomerId } : {}),
      itemType: input.itemType,
      attributes: input.attributes ?? {},
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
      status: 'DRAFT',
      online: false,
      createdAt: new Date().toISOString(),
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  async get(id: string): Promise<DraftProduct | null> {
    return this.drafts.get(id) ?? null;
  }

  async list(filter?: DraftFilter): Promise<DraftProduct[]> {
    let all = [...this.drafts.values()];
    if (filter?.status) all = all.filter((d) => d.status === filter.status);
    if (filter?.sourceCustomerId) all = all.filter((d) => d.sourceCustomerId === filter.sourceCustomerId);
    return all;
  }

  async update(id: string, patch: DraftPatch): Promise<DraftProduct> {
    const existing = this.drafts.get(id);
    if (!existing) throw new Error(`Draft not found: ${id}`);
    const updated: DraftProduct = { ...existing, ...patch };
    this.drafts.set(id, updated);
    return updated;
  }
}
