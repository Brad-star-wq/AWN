-- ============================================================
-- Redemption v2 — attribute-on-arrival
-- Idempotent: safe to run more than once.
-- Requires existing tables: customers, credit_ledger.
--
-- One record type for a redemption from EITHER origin (walkthrough §2):
--   • square_pos_other_tender (idea 1, this build): the owner rings the OTHER
--     tender on Square; the webhook creates the row unattributed
--     (customer_id = null, status = awaiting_attribution); a human assigns it
--     and finalizeRedemption() draws the ledger down.
--   • app_external_payment (idea 2, later): the app builds a Square order +
--     records an EXTERNAL payment; the customer is known at creation, so the
--     row is finalized immediately. No schema change needed — that's the seam.
--
-- Distinct from the legacy pending_redemptions table, which v2 keeps ONLY as an
-- optional auto-attribution fast path (see the webhook). Do not build new
-- features on pending_redemptions.
-- ============================================================

-- CREATE TYPE has no IF NOT EXISTS; guard it (matches phase5_tables.sql).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'redemption_origin') then
    create type redemption_origin as enum ('square_pos_other_tender', 'app_external_payment');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'redemption_status') then
    create type redemption_status as enum
      ('awaiting_attribution', 'finalized', 'reversed', 'void');
  end if;
end$$;

create table if not exists redemptions (
  id                  uuid primary key default gen_random_uuid(),
  -- NULL until attributed (idea 1); known at creation (idea 2).
  customer_id         uuid references customers(id),
  amount_cents        bigint not null check (amount_cents > 0),   -- integer cents
  location_id         text,
  -- The idempotency anchor: one Square payment → at most one redemption row.
  -- Nullable (unique still allows many NULLs) but in practice always set for a
  -- square_pos_other_tender row at creation, and for idea 2 from CreatePayment.
  square_payment_id   text unique,
  square_order_id     text,                                       -- null for idea 1; set for idea 2
  origin              redemption_origin not null,
  status              redemption_status not null default 'awaiting_attribution',
  ledger_entry_id     uuid references credit_ledger(id),          -- set on finalize
  flags               jsonb,                                      -- e.g. {"negative_balance": true}
  -- Attribution attempt number. Starts at 1; incremented each time a finalized
  -- row is reassigned back to awaiting_attribution. It namespaces the ledger
  -- redeem idempotency key so a deliberate reassign re-draws on the corrected
  -- customer, while a duplicate webhook replay is still blocked by the row's
  -- UNIQUE(square_payment_id) + the status guard in finalizeRedemption().
  attribution_attempt integer not null default 1,
  created_at          timestamptz not null default now(),
  finalized_at        timestamptz,
  updated_at          timestamptz not null default now()
);

-- The attribution queue reads awaiting_attribution rows (Phase D / F).
create index if not exists redemptions_status_idx on redemptions (status);
-- Newest-first scan of the open queue.
create index if not exists redemptions_awaiting_idx
  on redemptions (created_at)
  where status = 'awaiting_attribution';
