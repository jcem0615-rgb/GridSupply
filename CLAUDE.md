# GridSupply — Public School Supply Procurement Platform

Claude Code working document. Read `/docs` in numeric order before changing anything
structural.

## What this is
A multi-tenant PWA connecting Philippine public schools (DepEd) with school-supply
suppliers, digitising the full Purchase Request → Purchase Order → Delivery → Disbursement
Voucher → BIR Form 2307 workflow, with strict per-tenant data isolation and offline-first
capture in the field.

## Three portals, one codebase
1. **Owner Portal** — platform super-admin: school/supplier account management, branding
   asset uploads, subscription payment approval queue.
2. **School Portal** — a single Principal account per school: PR/PO/DV creation, print
   template customisation, cheque photo capture. The Custodian, BAC and Disbursing Officer
   are document signatories, not users.
3. **Supplier Portal** — Supplier Owner + employee sub-accounts: catalog, markup pricing,
   tax preview, cheque/2307 downloads, subscription fee payment.

All three share one Supabase project, separated entirely by Row Level Security — never by
separate deployments.

## Stack
- **Frontend:** React + Vite + TypeScript
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions), RLS on every table
- **Offline:** Dexie (IndexedDB) outbox with `client_uuid` idempotency, hand-written service
  worker, Background Sync
- **State:** Zustand · **Styling:** Tailwind CSS v4
- **Realtime chat:** Supabase Realtime, one channel per order thread
- **PDF/print:** print-CSS HTML → browser print (decided; see `docs/08`)
- **Push:** Web Push via Supabase Edge Function + service worker

## Build status — phases 0–8 implemented
| Phase | Where |
| --- | --- |
| 0 Foundation | `supabase/schema.sql`, `supabase/seed.sql`, `src/lib/db/` |
| 1 School core | `src/features/school/PRWizard.tsx`, `src/lib/orders.ts` |
| 2 Supplier core | `src/features/supplier/CatalogPage.tsx` |
| 3 Delivery & DV | `src/features/shared/OrderActions.tsx`, `src/lib/money.ts` |
| 4 Cheque & 2307 | `src/components/PhotoCapture.tsx`, `src/features/print/PrintDocs.tsx` |
| 5 Owner Portal | `src/features/owner/` |
| 6 Order chat | `src/features/shared/OrderChat.tsx` |
| 7 PWA offline | `public/sw.js`, `src/lib/sync.ts`, `src/lib/db/repo.ts` |
| 8 Print templates | `src/features/school/TemplateCustomizer.tsx` |

`npm run smoke` walks the whole lifecycle in a real browser and is the fastest way to check
you have not broken the critical path.

## Resolved decisions
- **PDF engine** — print-CSS only. Works offline, no bundle cost, the preview *is* the
  output, and the OS print dialog still yields a PDF. Revisit only if suppliers need
  server-generated archival copies.
- **EWT/VAT rates** — moved out of code into the `tax_config` table. A BIR change is an
  `UPDATE`, not a deploy.
- **Camera on iOS PWA** — `PhotoCapture` always offers a file-picker beside the camera
  button, because `capture` is unreliable in standalone iOS mode.
- **Payment proof storage** — private buckets keyed by tenant-id path prefix, enforced in
  the storage policy (`docs/02`), so School A cannot sign a URL for Supplier B's receipt.
- **Branding pipeline** — client-side canvas downscale to 1600px before storage. No Edge
  Function needed for a resize this simple.
- **Auth wiring** — `handle_new_user()` builds the `profiles` row from invite metadata.
  Admin-invite only; no self-service sign-up, which is correct for closed procurement.
- **Print customiser** — slot-based, not free drag-and-drop. Reasoning in `docs/08`.
- **One school login** — the `custodian`, `bac` and `disbursing` roles were removed and
  their permissions folded into `principal`. Separation of duties is now documented on the
  printed output (per-template signatories) rather than enforced by the software; see the
  trade-off note in `docs/04`. Dexie v2 drops the retired profiles from existing browsers.

## Open items
- **Supabase project is not provisioned.** The app runs local-first against IndexedDB; wire
  `.env` and apply `supabase/schema.sql` to move it onto Postgres. The RLS policies are
  written but have not been exercised against a live database.
- **Web Push has no Edge Function yet.** The service worker handles `push` and
  `notificationclick`; the sender and the subscription table are still to build.
- **Supplier employee invites** — `supplier.staff` is defined in the permission matrix but
  there is no invite UI yet.
- **Multi-district / division hierarchy** — out of scope for v1. Flag if the user asks for
  division-level dashboards; `schools.division` and `.district` are already captured.
- **WebUSB / thermal printing** — not applicable to this spec, deliberately skipped.
