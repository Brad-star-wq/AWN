import 'server-only';

import { engine } from '@/lib/server/engine';
import {
  defaultIntakeOptions,
  EMPTY_CATEGORY_OPTIONS,
  type CategoryOptions,
  type IntakeOptions,
} from '@/lib/categories';

/**
 * Read/write the owner-editable intake pick-lists (the `intake_options` table).
 * App-layer presentation config — the engine never reads this. Queries go over
 * the engine's shared pooler connection (`engine.sql`), same as the webhook.
 *
 * Seeding: on first read of an empty table we insert the historical constants
 * (idempotent, ON CONFLICT DO NOTHING) so the table becomes the source of truth
 * while preserving today's defaults. If the table is missing (migration not run)
 * or unreachable, we fall back to the constants so intake never breaks.
 */

export type OptionKind = 'category' | 'brand' | 'condition' | 'size' | 'color';
const OPTION_KINDS: OptionKind[] = ['category', 'brand', 'condition', 'size', 'color'];
const CATEGORY_LIST_KINDS = { brand: 'brands', condition: 'conditions', size: 'sizes', color: 'colors' } as const;

export function isOptionKind(v: string): v is OptionKind {
  return (OPTION_KINDS as string[]).includes(v);
}

type Row = { kind: string; category: string; value: string };

function buildFromRows(rows: Row[]): IntakeOptions {
  const categories: string[] = [];
  const byCategory: Record<string, CategoryOptions> = {};
  const ensure = (cat: string): CategoryOptions =>
    (byCategory[cat] ??= { brands: [], conditions: [], sizes: [], colors: [] });

  for (const r of rows) {
    if (r.kind === 'category') {
      categories.push(r.value);
      ensure(r.value);
    }
  }
  for (const r of rows) {
    const list = CATEGORY_LIST_KINDS[r.kind as keyof typeof CATEGORY_LIST_KINDS];
    if (list) ensure(r.category)[list].push(r.value);
  }
  return { categories, byCategory };
}

async function seedDefaults(): Promise<void> {
  const d = defaultIntakeOptions();
  const rows: Row[] = d.categories.map((c) => ({ kind: 'category', category: '', value: c }));
  for (const [cat, o] of Object.entries(d.byCategory)) {
    for (const v of o.brands) rows.push({ kind: 'brand', category: cat, value: v });
    for (const v of o.conditions) rows.push({ kind: 'condition', category: cat, value: v });
    for (const v of o.sizes) rows.push({ kind: 'size', category: cat, value: v });
    for (const v of o.colors) rows.push({ kind: 'color', category: cat, value: v });
  }
  for (const r of rows) {
    await engine.sql`
      insert into intake_options (kind, category, value)
      values (${r.kind}, ${r.category}, ${r.value})
      on conflict (kind, category, value) do nothing`;
  }
}

/** The current intake options, seeded from constants and falling back to them. */
export async function getIntakeOptions(): Promise<IntakeOptions> {
  try {
    let rows = (await engine.sql`select kind, category, value from intake_options`) as unknown as Row[];
    if (rows.length === 0) {
      await seedDefaults();
      rows = (await engine.sql`select kind, category, value from intake_options`) as unknown as Row[];
    }
    return buildFromRows(rows);
  } catch {
    // Table not migrated yet / DB unreachable — keep intake working on defaults.
    return defaultIntakeOptions();
  }
}

/** Add one option. `category` is ignored for kind='category'. Idempotent. */
export async function addIntakeOption(kind: OptionKind, category: string, value: string): Promise<void> {
  const cat = kind === 'category' ? '' : category;
  await engine.sql`
    insert into intake_options (kind, category, value)
    values (${kind}, ${cat}, ${value})
    on conflict (kind, category, value) do nothing`;
}

/** Remove one option. Removing a category does not cascade its child lists. */
export async function removeIntakeOption(kind: OptionKind, category: string, value: string): Promise<void> {
  const cat = kind === 'category' ? '' : category;
  await engine.sql`
    delete from intake_options where kind = ${kind} and category = ${cat} and value = ${value}`;
}

export { EMPTY_CATEGORY_OPTIONS };
