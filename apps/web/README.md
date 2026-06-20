# Resale — Owner Dashboard (`apps/web`)

Next.js (App Router) dashboard on top of the engine. The engine and the
Postgres connection are **server-only** — they never reach the browser. Money is
integer cents across every server boundary; dollars appear only in the UI.

It is an npm **workspace** package; the engine stays at the repo root and is
imported via the `@engine/*` alias (`experimental.externalDir`).

## Run locally

From the **repo root**:

```bash
npm install                      # installs the engine + the web workspace

# One-time: create the schema in your Supabase database (non-destructive).
# DATABASE_URL must be the Supabase *Session pooler* URL.
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  npm run db:setup
```

Configure the app env:

```bash
cp apps/web/.env.example apps/web/.env.local
# then edit apps/web/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>      (Settings → API)
#   DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Create the owner login (single owner for now): Supabase Dashboard →
**Authentication → Users → Add user** → email + password, tick **Auto Confirm
User**.

Start it:

```bash
npm run dev --workspace web      # http://localhost:3000  (redirects to /login)
```

## Notes

- Draft "push" uses the **mock** POS adapter (Square is Phase 5), so the catalog
  is per-process.
- "Sales today" and the unmatched-sales list are zero/empty until the Square
  sales feed exists; reconciliation here is read-only and driven by the
  persisted ledger (outstanding liability + negative balances are real).
