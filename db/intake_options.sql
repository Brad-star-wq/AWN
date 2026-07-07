-- ============================================================
-- intake_options — owner-editable pick-lists that drive the intake/finish forms
-- (categories + per-category brands / conditions / sizes / colors).
-- Idempotent: safe to run more than once.
--
-- Source of truth for the Settings CRUD. The app SEEDS this table from the
-- historical constants in apps/web/lib/categories.ts on first read (idempotent,
-- ON CONFLICT DO NOTHING), so "nothing configured" still yields the current
-- defaults, and add/remove operate over real rows from then on. If the table is
-- absent or empty, the forms fall back to those same constants — nothing breaks
-- before this migration runs.
--
-- Not engine data: the domain never reads this. It is app-layer presentation
-- config only, queried via the shared pooler connection.
-- ============================================================

create table if not exists intake_options (
  id          uuid primary key default gen_random_uuid(),
  -- 'category' | 'brand' | 'condition' | 'size' | 'color'
  kind        text not null check (kind in ('category', 'brand', 'condition', 'size', 'color')),
  -- '' for kind='category' (a top-level list); the parent category label otherwise.
  category    text not null default '',
  value       text not null,
  created_at  timestamptz not null default now(),
  -- One row per distinct option within its (kind, category) list.
  unique (kind, category, value)
);

-- The forms read the whole table and group by (kind, category); this keeps that scan tight.
create index if not exists intake_options_kind_category_idx on intake_options (kind, category);
