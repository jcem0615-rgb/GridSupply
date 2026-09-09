# GridSupply

A multi-tenant PWA connecting Philippine public schools (DepEd) with school-supply
suppliers, digitising the full **Purchase Request → Purchase Order → Delivery → Disbursement
Voucher → BIR Form 2307** workflow — offline-first, because the stockroom has no signal.

## Run it

```bash
npm install
npm run dev
```

Open the app and pick any of the seven demo accounts on the login screen. No backend is
required: the app is local-first and seeds a test school, a test supplier and a catalog into
IndexedDB on first boot.

Try the full loop in about two minutes:

1. **Roberto Santos** (Property Custodian) → New PR → pick items → save → submit
2. **Dr. Elena Villanueva** (Principal) → approve
3. **Aileen Mercado** (BAC) → issue Purchase Order
4. **Marites Delos Reyes** (Supplier) → accept → dispatch
5. **Roberto Santos** → receive & sign the IAR
6. **Ferdinand Lim** (Disbursing Officer) → generate DV → record cheque → issue BIR 2307
7. Open the **Documents** tab at any point to print the PR, PO, IAR, DV or 2307

## Wiring a real backend

```bash
cp .env.example .env    # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Then apply `supabase/schema.sql` to a fresh Supabase project (tables, RLS, storage buckets
and the auth trigger), and `supabase/seed.sql` for the test tenants. With the env vars set,
the outbox drains to Postgres and the order thread switches to Supabase Realtime; with them
unset, everything stays in IndexedDB and the app is fully usable.

## Stack

| Concern | Choice |
| --- | --- |
| Frontend | React + Vite + TypeScript |
| Backend | Supabase — Postgres, Auth, Storage, Realtime, Edge Functions |
| Isolation | Row Level Security on every table; one project, three portals |
| Offline | Dexie (IndexedDB) outbox with `client_uuid` idempotency |
| Service worker | Hand-written — app-shell cache, Background Sync, Web Push |
| State | Zustand |
| Styling | Tailwind CSS v4 |
| Documents | Print-CSS → the browser's own print / Save as PDF |

## Layout

```
src/
  lib/          money (tax engine) · orders (lifecycle) · permissions · db (Dexie + outbox) · sync
  features/
    auth/       login and demo role picker
    school/     dashboard · PR wizard · orders · print-template customiser
    supplier/   dashboard · catalog with markup slider · orders · billing
    owner/      dashboard · accounts · payment review queue · branding
    shared/     order detail · lifecycle actions · order chat
    print/      PR · PO · IAR · DV · BIR 2307 sheets
  components/   UI kit · layout · offline bar · install prompt · camera capture
supabase/       schema.sql (tables, RLS, storage, auth trigger) · seed.sql
docs/           01–08, read in order
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the build (needed to exercise the service worker) |
| `npm run lint` | oxlint |
| `npm run icons` | Regenerate PWA icons from `public/icons/icon.svg` |
| `npm run smoke` | Drive all nine lifecycle steps across the three portals in a real browser |
| `npm run pwa-check` | Verify service-worker control, offline boot and offline capture |

Both browser checks need a **production** build served by `preview` — the service worker
does not register in dev:

```bash
npm run build && npm run preview &
npm run smoke && npm run pwa-check
```

## Deployment

The production branch is `claude/gridsupply-pwa-app-kzge42`; Vercel builds and deploys on
every push to it. `vercel.json` carries the whole configuration, so an import needs no
manual settings:

- **SPA rewrites** so a hard refresh on `/school` or `/orders/:id` serves the app rather
  than a 404. Rewrites apply only after a filesystem miss, so hashed assets, `sw.js` and
  the manifest are still served directly.
- **`sw.js` as `must-revalidate`** — a long-cached service worker would pin visitors to a
  stale build, which is the usual way a PWA gets wedged. Hashed assets get the opposite:
  immutable, one year.
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on install**, because `playwright` is a
  devDependency used only by `npm run smoke` and `npm run pwa-check`. Without it every
  build downloads several hundred MB of browsers it never launches.

Node is pinned to 22.x via `engines` and `.nvmrc`; Vite 8 requires `^20.19 || >=22.12`.

Note that Vercel only builds on pushes made *after* the Git connection exists — connecting
the repository does not retroactively deploy the commits already on the branch.

## Status

Phases 0–8 of the build order are implemented. Known follow-ups are listed in `CLAUDE.md`.
