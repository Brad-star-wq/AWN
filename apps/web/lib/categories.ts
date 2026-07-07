import type { ItemType } from './types';

// Interim POS-pad categories. The full Settings-driven category list (with its
// own advanced field sets) lands in Phase E; until then these cover the shop's
// real buckets. `itemType` is the engine's coarse type; `label` is kept on each
// stub's attributes so "Clothing" vs "Other" survives even though both are OTHER.
export interface StoreCategory {
  label: string;
  itemType: ItemType;
}

export const STORE_CATEGORIES: StoreCategory[] = [
  { label: 'Sneakers', itemType: 'SHOE' },
  { label: 'Cards', itemType: 'CARD' },
  { label: 'Clothing', itemType: 'OTHER' },
  { label: 'Other', itemType: 'OTHER' },
];

// Static advanced options for the in-store quick pickers (Settings-driven later).
export const ADVANCED_OPTIONS: Record<string, { sizes?: string[]; conditions: string[]; brands: string[]; colors?: string[] }> = {
  Sneakers: { sizes: ['8', '8.5', '9', '9.5', '10', '10.5', '11', '12'], conditions: ['DS', 'VNDS', 'Used', 'Beater'], brands: ['Nike', 'Jordan', 'New Balance', 'Adidas', 'Yeezy'], colors: ['Black', 'White', 'Red', 'Grey', 'Blue', 'Green'] },
  Cards: { conditions: ['Mint', 'NM', 'Played'], brands: ['Topps', 'Panini', 'Pokémon'], colors: [] },
  Clothing: { sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], conditions: ['New', 'Good', 'Worn'], brands: ['Nike', 'Supreme', 'Carhartt'], colors: ['Black', 'White', 'Grey', 'Navy', 'Tan'] },
  Accessories: { conditions: ['New', 'Used'], brands: [], colors: ['Black', 'Brown', 'White'] },
  Other: { conditions: ['New', 'Used'], brands: [], colors: [] },
};

// The full finish-form category set (mockup: dashboard-finish-item-clean.html).
export const FINISH_CATEGORIES = ['Sneakers', 'Cards', 'Clothing', 'Accessories', 'Other'] as const;

/** Map a category label to the engine's coarse item type. */
export function categoryItemType(label: string): ItemType {
  if (label === 'Sneakers') return 'SHOE';
  if (label === 'Cards') return 'CARD';
  return 'OTHER';
}

// ---- Settings-driven intake options ---------------------------------------
// The forms used to read the constants above directly. They now read an
// `IntakeOptions` value (Settings-editable, persisted in the `intake_options`
// table). The constants remain as the SEED/DEFAULT so nothing configured — or a
// DB that isn't reachable — still yields today's exact lists.

export interface CategoryOptions {
  brands: string[];
  conditions: string[];
  sizes: string[];
  colors: string[];
}
export interface IntakeOptions {
  categories: string[];
  byCategory: Record<string, CategoryOptions>;
}

/** The historical hardcoded lists, as an IntakeOptions value. The seed/fallback. */
export function defaultIntakeOptions(): IntakeOptions {
  const byCategory: Record<string, CategoryOptions> = {};
  for (const cat of FINISH_CATEGORIES) {
    const a = ADVANCED_OPTIONS[cat] ?? ADVANCED_OPTIONS.Other!;
    byCategory[cat] = {
      brands: [...a.brands],
      conditions: [...a.conditions],
      sizes: [...(a.sizes ?? [])],
      colors: [...(a.colors ?? [])],
    };
  }
  return { categories: [...FINISH_CATEGORIES], byCategory };
}

/** A safe empty option set for an unknown category (never undefined at a call site). */
export const EMPTY_CATEGORY_OPTIONS: CategoryOptions = { brands: [], conditions: [], sizes: [], colors: [] };

