# Resale Engine

The POS-agnostic core of the resale back-office. It owns the things Square
can't: the **store-credit ledger**, **intake**, **draft products**, and
**reconciliation**. It talks to the outside world only through ports, so it
runs against a mock today and the real Square adapter later — unchanged.

## Design rules

- **Money is integer cents.** No floats touch the money path.
- **The ledger is append-only.** A balance is the `SUM` of immutable, signed
  entries (`ISSUE` positive, `REDEEM` negative) — never a stored column that
  could drift. Corrections are new `ADJUST`/`REVERSAL` rows.
- **Idempotent by construction.** Every external event carries an
  idempotency key; replaying the same sale (duplicate webhook, catch-up
  pull) can never deduct twice.
- **Unmatched is surfaced, never dropped.** A sale with no customer, or an
  unknown one, returns an `UNMATCHED` result for reconciliation to resolve.

## Structure

```
db/schema.sql                          Postgres / Supabase schema (production store)
src/domain/types.ts                    Domain types + the SaleEvent seam contract
src/domain/ledger.ts                   The ledger: issue, redeem, applySaleEvent
src/ports/ledgerRepository.ts          Storage port (in-memory ↔ Postgres)
src/ports/posAdapter.ts                POS port (mock ↔ Square)
src/adapters/inMemoryLedgerRepository  In-memory store for tests / local dev
test/ledger.test.ts                    Correctness suite (7 tests)
```

## The two redemption modes

`redeemCredit({ ..., enforceBalance })` supports both flows discussed:

- `true` — **app-first**: the app caps the amount, so an overdraw is
  rejected (`OverdrawError`).
- `false` — **Square-first**: the redemption is recorded regardless, and a
  resulting negative balance is left for reconciliation to flag.

## Run

```bash
npm install
npm test            # 23 tests
npx tsc --noEmit    # strict typecheck
npm run demo        # full end-to-end walkthrough, printed to the console
```

`npm run demo` seeds customers via intake, completes and pushes a draft,
generates a realistic day of mock sales (store-credit tenders, a card-only
sale, a no-customer sale, an unknown customer, a duplicate event, an
over-redemption), applies them, then prints balances and the reconciliation
report.

## Status

Phases 1–3 are done (see `BUILD_PLAN.md`): the **mock POS adapter** + scenario,
**reconciliation** (`reconcileDay`), and **intake + drafts** (with the
`CustomerRepository` / `DraftRepository` ports).

## Next

- **Postgres `LedgerRepository`** — the production implementation of the
  storage port, behind a shared repository-contract test.
- **Square adapter** — the real POS wiring, emitting the same `SaleEvent` the
  mock does (gated on the open questions in `BUILD_PLAN.md`).
