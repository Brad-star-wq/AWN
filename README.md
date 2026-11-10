# Resale POS — Store-Credit Ledger & Buy-Outright Back Office

A back-office system for a small sneaker and trading-card resale shop. When the shop buys goods from walk-in sellers, it often pays in **store credit** — and before this, every customer's balance lived in the owner's head. This app gives that money a durable, auditable home and connects it to the shop's existing **Square** register.

> **Status:** built and verified against the Square sandbox; not yet in daily use at the shop.

<!-- Screenshots: add 2–3 here (in-store lookup, buy flow, dashboard) -->

## What it does

- **In-store mode (mobile-first):** look up a customer, log a buy in seconds with a custom keypad, and load store credit or redeem it. Built to be used one-handed at the counter.
- **Dashboard mode:** finish items logged in a hurry, manage customers, review end-of-day, and edit settings.
- **Intake → drafts → Square:** items bought from sellers start as rough drafts with photos, then get pushed into Square's catalog once they're finished.
- **Redemptions through Square:** when credit is spent at the register, a Square webhook records it, and a human attributes it to the right customer.
- **Installable PWA** for the shop's phone or tablet.

## Design decisions

- **Money is integer cents.** No floating point anywhere in the money path.
- **The ledger is append-only.** A balance is the sum of immutable signed entries — never a stored, editable number. Corrections are new reversal or adjustment entries.
- **Idempotent by construction.** Every external event carries an idempotency key, so a retried webhook or a duplicate sale can never charge twice.
- **POS-agnostic core (ports & adapters).** The domain logic never imports Square or Postgres. It talks to storage and the POS through interfaces, so the same engine runs against in-memory fakes in tests and against Postgres + Square in production.
- **Fail-closed webhooks.** Square webhooks are verified with HMAC-SHA256 against the raw request body; anything that can't be verified is rejected.
- **Unmatched is surfaced, never dropped.** Sales that can't be tied to a customer go to a reconciliation queue instead of disappearing.

## Architecture

```
src/domain/      Ledger, intake, drafts, redemptions, reconciliation (pure logic)
src/ports/       Interfaces for storage and the POS
src/adapters/    In-memory, Postgres, and Square implementations of those ports
db/              Postgres / Supabase schema
apps/web/        Next.js dashboard + in-store UI (imports the engine server-side only)
test/            Unit tests + repository contract tests
```

Repository **contract tests** run the same suite against every storage implementation (in-memory and Postgres), so swapping storage can't silently change behavior.

## Stack

TypeScript · Next.js (App Router) · React · Tailwind CSS · Supabase (Postgres + Auth) · Square APIs (Catalog, Payments, Webhooks) · Netlify · Node test runner

## Run locally

```bash
npm install
npm test             # offline test suite (Postgres tests skip without a database)
npm run typecheck
npm run demo         # in-memory end-to-end demo: a day of buys, sales, and reconciliation
```

To run against Postgres and the web app, copy `.env.example` → `.env` and `apps/web/.env.example` → `apps/web/.env.local`, fill in your own Supabase and Square sandbox values, then:

```bash
npm run db:setup     # apply the schema (non-destructive)
npm run test:pg      # contract tests against Postgres
npm run dev -w apps/web
```
