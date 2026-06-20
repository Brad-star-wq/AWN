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
export const ADVANCED_OPTIONS: Record<string, { sizes?: string[]; conditions: string[]; brands: string[] }> = {
  Sneakers: { sizes: ['8', '9', '9.5', '10', '11', '12'], conditions: ['DS', 'VNDS', 'Used'], brands: ['Nike', 'Jordan', 'Adidas', 'New Balance'] },
  Cards: { conditions: ['Mint', 'NM', 'Played'], brands: ['Topps', 'Panini', 'Pokémon'] },
  Clothing: { sizes: ['S', 'M', 'L', 'XL'], conditions: ['New', 'Good', 'Worn'], brands: ['Nike', 'Supreme', 'Carhartt'] },
  Other: { conditions: ['New', 'Used'], brands: [] },
};
