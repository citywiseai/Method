# Rezio Build Tracker

A construction/development tracker for Rezio's Arizona residential
projects: phase checklists, Gantt schedule, budget/financing/draws/lien
waivers/COI tracking, contacts & bids, portfolio dashboard, warranty
tracking, and pre-acquisition feasibility research — for a single
developer/team, not a multi-tenant SaaS product.

This is the real, deployable successor to a single-file HTML Artifact
(`cactus-build-app.html`) that stored everything in browser
`localStorage`. This version stores data in Postgres behind a small set of
Next.js API routes, and adds two server-side integrations the old
sandboxed Artifact could never call directly: Google Maps imagery and an
Anthropic-powered feasibility research pass.

## Architecture decisions

**Ported the existing engine, did not rewrite it.** The original file's
`<script>` block (~3,800 lines) — state shape, `patchState()`, `render()`,
every `get*`/`set*` helper, every render function for every view — was
already correct and had months of real use behind it. Re-deriving that as
React components from scratch would have been slow and risky for no
functional benefit. Instead:

- `public/engine.js` is that script, lightly patched: `localStorage`
  read/write became `fetch('/api/state')` GET on load and a debounced
  `PUT` on every `saveState()` call (same call sites as before — only the
  transport changed); the backup-export path swapped a Cowork-sandbox-only
  download capability for a plain browser `Blob` download; and two new
  functions (`runAutoFeasibility`, `fetchSiteImagery`) call the two new API
  routes and were wired into the existing Feasibility & Site Overview
  section's buttons.
- `components/trackerShell.ts` holds the original file's static body
  markup (nav bar, view containers, lightbox) verbatim, so `engine.js`
  finds its `#phaseList` / `#ganttMain` / `#budgetMain` / etc. containers
  exactly as before.
- `app/tracker.css` is the original `<style>` block verbatim, with one bug
  fix (see below).
- `components/Tracker.tsx` mounts the shell markup and loads `engine.js`
  as a plain script tag via `next/script` — intentionally *not* rewritten
  as idiomatic React, to keep the ported logic's behavior identical to the
  original.

One real bug was found and fixed while porting: `app/tracker.css` had an
invalid CSS rule (`:root[data-theme="dark"] .icon-link, @media (...){...}`
— a selector list can't mix a selector with an at-rule). It now compiles to
two separate rules with the same intent.

**Prisma schema is included; the running app currently talks to Postgres
directly via `pg`.** `prisma/schema.prisma` defines the `AppState` model
and `prisma/migrations/20260825000000_init/migration.sql` is a hand-
verified migration that creates it — these are the project's real,
intended-to-be-used Prisma artifacts. However, in the sandbox this app was
built and tested in, the Prisma CLI could not run at all: `prisma
generate`, `prisma format`, and `prisma migrate` all need to download a
query/schema engine binary from `binaries.prisma.sh` on first use, and
that sandbox's outbound network policy only allows a short allowlist of
hosts (npm registry, PyPI, the Anthropic API, etc.) that does not include
it — every attempt failed with a 403 at the network layer, not a Prisma
bug. Rather than ship code that imports a Prisma Client that could never
be generated here (which would fail `npm run build`), `lib/db.ts` talks to
Postgres directly through `pg`, using the exact table shape the Prisma
schema declares. **The moment this repository is running anywhere with
normal internet access** (your machine, CI, or Vercel's build machines,
all of which can reach `binaries.prisma.sh` fine), you can switch to a
real generated Prisma Client:

```bash
npx prisma generate
npx prisma migrate deploy   # applies prisma/migrations/ the standard way
```

and swap `lib/db.ts`'s two functions for `prisma.appState.findUnique(...)`
/ `prisma.appState.upsert(...)`. Nothing else in the app needs to change —
the API routes only call `getAppState()` / `putAppState()`.

**`/api/imagery`** calls Google's Static Maps API (satellite) and Street
View Static API directly from the server using `GOOGLE_MAPS_API_KEY`. It
checks the Street View metadata endpoint first and returns
`streetViewAvailable: false` (with a working overhead image URL) rather
than a broken image link when there's no coverage. URL construction and
the coverage check live in `lib/imagery.ts` so they're unit-testable with
a mocked `fetch` — see Testing below.

**`/api/feasibility`** calls the Anthropic API with the web search tool
for a best-effort feasibility pass on an AZ residential address, returning
markdown. It is explicitly a **lighter-weight, automated** version — it
has no access to the full manual research pipeline's sources (Box-hosted
permit archives, Regrid parcel data, city GIS layers), and the report it
generates says so. The existing "Import Feasibility Package" manual-paste
flow in Settings is **not removed** — it remains the fuller/authoritative
path; the new "Run Feasibility (AI)" button is a quick first pass that
fills the same fields.

## What's NOT fully ported (be specific, not vague)

Everything in the source file's feature list is ported and working:
multi-project switching, per-lot checklists with sub-locations/
selections/notes, Gantt, budget/financing/retainage/draws/lien
waivers/COI, contacts/bids, portfolio dashboard, print report, warranty
tracking, and backup export/import. Two things are intentionally new
behavior rather than gaps:

- **Backup export** now downloads via the browser's native download
  mechanism instead of the Cowork Artifact sandbox's `downloads`
  capability — required, since this is no longer running inside that
  sandbox. Import is unchanged (reads a local file with `FileReader`).
- **Image storage for site imagery**: manually-uploaded feasibility photos
  are still stored as compressed data URIs in the state JSON (as before).
  Images fetched from `/api/imagery` are stored as the direct Google-hosted
  URLs instead of being downloaded/re-encoded — simpler for a first
  version, but it means those specific images go stale/inaccessible if the
  API key is later revoked or Google's URL scheme changes. Downloading and
  caching them (e.g. to Vercel Blob or Supabase Storage) is a reasonable
  v2 improvement, noted here rather than silently done differently from
  what the task described.

Nothing else was cut, stubbed, or left as a TODO.

## Local development

Prerequisites: Node 20+, a Postgres database reachable at `DATABASE_URL`.

```bash
cp .env.example .env
# edit .env: at minimum set DATABASE_URL to a local Postgres.
# GOOGLE_MAPS_API_KEY / ANTHROPIC_API_KEY can stay blank locally — the app
# runs fine without them, those two API routes just return a clear 500
# until keys are set.

npm install
npm run db:migrate   # applies prisma/migrations/*/migration.sql directly
                      # via `pg` (see "Prisma schema" above for why this
                      # isn't `prisma migrate deploy` in this environment;
                      # use that command instead once you're somewhere
                      # with normal internet access)
npm run dev           # http://localhost:3000
```

No Postgres handy? Any of these work:
- `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`
- A local `postgresql` install (`pg_ctlcluster` / `pg_ctl start`)
- A free Supabase project (same connection string you'll use in
  production — see below)

### Testing

- `npm run build` — production build, zero TypeScript/build errors
  required.
- `npm run lint` — ESLint (the ported `public/engine.js` is intentionally
  excluded — it keeps the source file's vanilla-JS style rather than being
  rewritten to satisfy this project's TypeScript lint rules).
- `npm run test:routes` — mocked unit tests for `/api/imagery` and
  `/api/feasibility`'s logic (`lib/imagery.ts`, `lib/feasibility.ts`),
  using a fake `fetch` / fake Anthropic client — no real API keys needed.
  Covers: correct Google Maps URL construction, the Street View coverage
  success path, the no-coverage path, a metadata-fetch network error, the
  feasibility prompt, extracting markdown from mixed tool-use/text
  response blocks, and error propagation.
- `node scripts/smoke-test.mjs` — a Playwright smoke test against a
  running `npm run dev` instance: loads the app, confirms the checklist
  view renders, checks off a checklist item and waits for the resulting
  `PUT /api/state`, reloads and confirms the change persisted, and clicks
  through all four other tabs (Gantt/Budget/Directory/Settings).

## Deployment (Supabase + Vercel)

You'll need: a GitHub account with push access to this repo, a Supabase
account, and a Vercel account. None of this requires writing code.

1. **Push this repo.** From this directory:
   ```bash
   git push -u origin main
   ```
   (the remote is already set to `https://github.com/citywiseai/Method.git`
   — see "Repo status" below.)

2. **Create a Supabase project** at [supabase.com](https://supabase.com) →
   New Project. Pick a region close to where you'll deploy on Vercel.

3. **Get the Postgres connection string**: in your Supabase project →
   Project Settings → Database → Connection string → "URI" tab. Use the
   **Transaction pooler** connection (port 6543) for `DATABASE_URL` — it's
   built for serverless/edge functions like Vercel's. Copy it and replace
   the `[YOUR-PASSWORD]` placeholder with your database password.

4. **Apply the migration** once, from your own machine (which has normal
   internet access, unlike the sandbox this was built in):
   ```bash
   DATABASE_URL="<your supabase connection string>" npx prisma migrate deploy
   ```
   (or `npm run db:migrate` with the same `DATABASE_URL` set, which runs
   the same SQL without needing the Prisma CLI.)

5. **Get a Google Maps API key**: Google Cloud Console
   ([console.cloud.google.com](https://console.cloud.google.com)) → create
   or pick a project → APIs & Services → Library → enable **Maps Static
   API** and **Street View Static API** → APIs & Services → Credentials →
   Create Credentials → API key. Google requires a billing account on the
   project even to stay within the free monthly usage tier — add one under
   Billing. Once the key works, restrict it (Credentials → your key →
   API restrictions) to just those two APIs.

6. **Get an Anthropic API key**: [console.anthropic.com](https://console.anthropic.com)
   → Settings → API Keys → Create Key.

7. **Create a Vercel project**: [vercel.com](https://vercel.com) → Add New
   → Project → Import the `citywiseai/Method` GitHub repo → it will
   auto-detect Next.js.

8. **Set environment variables** in the Vercel project (Settings →
   Environment Variables), for Production (and Preview, if you want PR
   previews to work): `DATABASE_URL`, `GOOGLE_MAPS_API_KEY`,
   `ANTHROPIC_API_KEY` — the same three values from `.env.example`.

9. **Deploy** — Vercel deploys automatically on push once the project is
   connected; or click Deploy on the project page for the first one.

That's it — the app is live at the Vercel-assigned URL (or a custom domain
you attach in Vercel's Domains settings).

## Repo status

This directory is a git repository with `origin` already set to
`https://github.com/citywiseai/Method.git`. **Nothing has been pushed** —
push access wasn't available while building this. Once you have push
access: `git push -u origin main`.

## Environment variables

See `.env.example` for the full list with source links. Summary:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase project → Settings → Database → Connection string |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console → enable Maps Static API + Street View Static API (billing required) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys |
