-- ============================================================
-- Resale back-office engine — core schema (PostgreSQL / Supabase)
--
-- Principles:
--   • Money is stored as integer cents (bigint). Never floats.
--   • The credit ledger is APPEND-ONLY. A customer's balance is the
--     SUM of their ledger entries, never a stored/mutated column.
--     Rows are never updated or deleted; corrections are new rows.
--   • Idempotency is enforced at the database level, so the same
--     external event can never post twice.
-- ============================================================

-- ---- Customers ---------------------------------------------
create table customers (
  id                uuid primary key default gen_random_uuid(),
  display_name      text not null,
  phone             text,
  -- Link to the POS customer record. This is the join key the
  -- engine uses to match an incoming sale to a customer.
  pos_customer_ref  text unique,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);
create index customers_phone_idx on customers (phone);

-- ---- Credit ledger (append-only) ---------------------------
-- balance(customer) = SUM(delta_cents) WHERE customer_id = ?
-- delta_cents is signed: ISSUE > 0, REDEEM < 0.
create type ledger_kind   as enum ('ISSUE', 'REDEEM', 'ADJUST', 'REVERSAL');
create type ledger_source as enum ('INTAKE', 'SALE', 'MANUAL');

create table credit_ledger (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references customers(id),
  kind             ledger_kind   not null,
  delta_cents      bigint        not null,           -- signed
  source           ledger_source not null,
  source_ref       text,                             -- intake id / sale order id
  -- Idempotency: the same external event can never post twice.
  idempotency_key  text unique,
  note             text,
  created_by       text,
  created_at       timestamptz   not null default now()
);
create index credit_ledger_customer_idx on credit_ledger (customer_id, created_at);

-- Enforce the sign convention so a bug can't write a positive REDEEM.
alter table credit_ledger add constraint ledger_sign_chk check (
  (kind = 'ISSUE'  and delta_cents > 0) or
  (kind = 'REDEEM' and delta_cents < 0) or
  (kind in ('ADJUST', 'REVERSAL'))
);

-- ---- Draft products ----------------------------------------
-- Items taken in at the counter become drafts here, finished
-- later, and pushed to the POS catalog when ready.
create type item_type    as enum ('SHOE', 'CARD', 'OTHER');
create type draft_status as enum ('DRAFT', 'READY', 'PUSHED');

create table draft_products (
  id                  uuid primary key default gen_random_uuid(),
  source_customer_id  uuid references customers(id),  -- who sold it to us
  item_type           item_type    not null default 'OTHER',
  attributes          jsonb        not null default '{}'::jsonb,  -- type-specific fields
  price_cents         bigint,
  status              draft_status not null default 'DRAFT',
  online              boolean      not null default false,
  pos_catalog_ref     text,                            -- set once pushed
  created_at          timestamptz  not null default now(),
  pushed_at           timestamptz
);
create index draft_products_status_idx on draft_products (status);

-- ---- Sale events (the adapter seam, inbound) ---------------
-- Every normalized sale the engine receives is recorded here,
-- keyed by its external id for idempotency and reconciliation.
create type sale_event_status as enum ('RECEIVED', 'APPLIED', 'UNMATCHED', 'IGNORED');

create table sale_events (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text not null unique,            -- POS event id (idempotency)
  order_ref           text,
  pos_customer_ref    text,
  customer_id         uuid references customers(id),   -- resolved, if matched
  store_credit_cents  bigint not null default 0,       -- store-credit tender on this sale
  occurred_at         timestamptz,
  status              sale_event_status not null default 'RECEIVED',
  payload             jsonb,                           -- normalized event, for audit
  received_at         timestamptz not null default now(),
  applied_at          timestamptz
);
