-- ============================================================
-- Phase 5 — Square reconciliation tables (app-owned)
-- Idempotent: safe to run more than once.
-- Requires existing tables: customers, credit_ledger.
-- ============================================================

-- ---- pending_redemptions -----------------------------------
-- A redeem intent, written when the owner starts a redeem in the app, BEFORE
-- any ledger entry is finalized. The webhook matcher confirms it against a
-- Square OTHER-tender payment (amount + location + time) and only then posts
-- the negative ledger entry (idempotent on the Square payment id).

-- CREATE TYPE has no IF NOT EXISTS; guard it.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pending_redemption_status') then
    create type pending_redemption_status as enum ('PENDING', 'RECONCILED', 'EXPIRED');
  end if;
end$$;

create table if not exists pending_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers(id),  -- the app owns "who"
  amount_cents          bigint not null check (amount_cents > 0), -- integer cents
  location_id           text not null,                  -- Square location; part of the match key
  status                pending_redemption_status not null default 'PENDING',
  created_at            timestamptz not null default now(),  -- the time-window anchor
  reconciled_payment_id text,                            -- the Square payment that confirmed it
  reconciled_at         timestamptz,
  ledger_entry_id       uuid references credit_ledger(id)
);

-- The matcher only ever scans open intents.
create index if not exists pending_redemptions_open_idx
  on pending_redemptions (location_id, amount_cents, created_at)
  where status = 'PENDING';

-- The refund path looks a redemption up by the Square payment it reconciled to.
create index if not exists pending_redemptions_payment_idx
  on pending_redemptions (reconciled_payment_id)
  where reconciled_payment_id is not null;

-- ---- square_webhook_events ---------------------------------
-- Webhook delivery dedupe. Square retries; each event_id is processed at most
-- once. This is the optimization layer — the real double-post guard is still
-- the ledger's unique idempotency_key on the Square payment id.
create table if not exists square_webhook_events (
  event_id      text primary key,                        -- Square event_id
  event_type    text,                                    -- payment.updated, refund.created, ...
  processed_at  timestamptz not null default now()
);

-- ---- reconciliation_alerts ---------------------------------
-- The loud, recoverable surface for cases the matcher refuses to auto-resolve:
-- an OTHER payment with no pending (NO_PENDING), two pendings that fit the same
-- payment (AMBIGUOUS), a pending whose window elapsed unpaid (STALE_PENDING),
-- and a refund for a payment never reconciled (REFUND_NO_REDEMPTION). Persisted
-- so they are checkable in the DB and a dashboard can list/resolve them.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reconciliation_alert_kind') then
    create type reconciliation_alert_kind as enum
      ('NO_PENDING', 'AMBIGUOUS', 'STALE_PENDING', 'REFUND_NO_REDEMPTION');
  end if;
end$$;

create table if not exists reconciliation_alerts (
  id            uuid primary key default gen_random_uuid(),
  kind          reconciliation_alert_kind not null,
  payment_id    text,
  refund_id     text,
  amount_cents  bigint,
  location_id   text,
  pending_id    uuid,
  detail        jsonb,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists reconciliation_alerts_open_idx
  on reconciliation_alerts (created_at) where resolved_at is null;
