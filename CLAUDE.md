# GridSupply — Public School Supply Procurement Platform

Claude Code working document. Read `/docs` in numeric order before changing anything
structural.

## What this is
A multi-tenant PWA connecting Philippine public schools (DepEd) with school-supply
suppliers, digitising the full Purchase Request → Purchase Order → Delivery → Disbursement
Voucher → BIR Form 2307 workflow, with strict per-tenant data isolation and offline-first
capture in the field.

## Three portals, one codebase
1. **Owner Portal** — platform super-admin: full CRUD on schools, suppliers and people;
   branding asset uploads; published payment methods; subscription payment approval queue.
2. **School Portal** — a Principal plus at most one School Admin, who performs the same
   workflow steps: PR/PO/DV creation, print template customisation, cheque photo capture.
   The Custodian, BAC and Disbursing Officer are document signatories, not users.
3. **Supplier Portal** — Supplier Owner + employee sub-accounts: catalog, markup pricing,
   tax preview, inventory with a stock ledger, cheque/2307 downloads, subscription fee
   payment, and a Clients book of the schools they serve.

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
| — Accounts & auth | `src/lib/accounts.ts`, `src/lib/auth/password.ts`, `src/features/supplier/TeamPage.tsx` |

`npm run smoke` walks the whole lifecycle in a real browser and is the fastest way to check
you have not broken the critical path.

## Design system
Warm, cozy palette on glassmorphic surfaces. `src/index.css` holds the whole thing:

- **Token names are stable.** `ink-50..900`, `brand`, `accent` kept their names when the
  palette changed from green to terracotta, so ~300 existing class attributes reskinned by
  editing values. Change colours there, not in components.
- **The neutral ramp is warm taupe, not grey** — a true grey reads as dirt on a cream
  ground. `ink-400` carries most small secondary text and is held at 4.9:1.
- **Glass needs something to refract.** `.aurora` (drifting warm gradients) and `.grain`
  sit behind everything; without them blurred panels read as flat grey. Both are
  `position: fixed` with `pointer-events: none`, and the aurora stops animating under
  `prefers-reduced-motion`.
- **Never nest `.glass` inside `.glass`** — stacked translucency turns muddy. `Empty` is
  deliberately a dashed outline, not a panel, because it always renders inside a `Card`.
- **`@supports not (backdrop-filter)`** falls back to near-opaque surfaces, or the design
  collapses into unreadable smears on browsers without blur.
- **Print strips all of it.** `@media print` forces glass to opaque white and hides the
  aurora — a `backdrop-filter` can render a sheet blank on some printers, and the documents
  are the product.
- **Logo.** `public/icons/logo-mark.svg` is the source of truth; `npm run icons` composes
  every launcher size from it. The mark is authored on a transparent ground so it can sit
  on glass in the header.

## Resolved decisions
- **PDF engine** — print-CSS only. Works offline, no bundle cost, the preview *is* the
  output, and the OS print dialog still yields a PDF. Revisit only if suppliers need
  server-generated archival copies.
- **EWT/VAT rates** — moved out of code into the `tax_config` table. A BIR change is an
  `UPDATE`, not a deploy.
- **The school records the supplier's VAT status per order.** `orders.supplier_vat_registered`
  defaults from the supplier's record but the school sets it in the PR wizard and can
  correct it until the DV is issued, after which it locks — withholdings on an issued
  voucher must not move. It is a snapshot, not a live lookup, so a supplier registering
  for VAT later cannot restate the tax on vouchers already printed. The school decides
  because the school is the withholding agent. Non-VAT drops the 12% VAT and the 5% final
  VAT withholding and applies percentage tax (`percentage_tax_rate`, ATC WB080) instead;
  **that rate ships at 3% and should be confirmed with an accountant.** See `docs/05`.
- **Camera on iOS PWA** — `PhotoCapture` always offers a file-picker beside the camera
  button, because `capture` is unreliable in standalone iOS mode.
- **Payment proof storage** — private buckets keyed by tenant-id path prefix, enforced in
  the storage policy (`docs/02`), so School A cannot sign a URL for Supplier B's receipt.
- **Branding pipeline** — client-side canvas downscale to 1600px before storage. No Edge
  Function needed for a resize this simple.
- **Auth wiring** — `handle_new_user()` builds the `profiles` row from invite metadata.
  Admin-invite only; no self-service sign-up, which is correct for closed procurement.
- **Print customiser** — slot-based, not free drag-and-drop. Reasoning in `docs/08`.
- **Deleting a tenant with orders is refused, not cascaded.** Purchase orders and vouchers
  are an audit trail for public funds. The Owner Portal blocks the delete and points at
  `stopped`, which revokes access and is reversible. A tenant with no orders deletes, and
  its people cascade with it.
- **"Keep me signed in" moves the session between storages.** Checked persists to
  `localStorage`, unchecked to `sessionStorage` so a shared-workstation session ends with
  the browser. An absent preference counts as remembered, so upgrading installs are not
  signed out. Details and the reveal-toggle notes in `docs/09`.
- **Password resets follow the tenant boundary.** The Owner resets anyone; a Supplier
  Owner resets only accounts carrying their own `supplier_id`. A supplier resetting a
  school Principal would hand a vendor the account that approves their own POs, so it is
  refused in `canResetPasswordFor()`, in the Team page query, and in RLS (both `USING` and
  `WITH CHECK`). Reasoning in `docs/09`.
- **A supplier's clients are schools that issued them a PO**, not every school on the
  platform — a school browsing the catalog is not yet a client. The school's own record
  (name, TIN, address) is read-only there because it prints on the PO, DV and 2307 and is
  the school's to maintain; what a supplier edits is the relationship — contact person,
  delivery notes, internal notes — held in `supplier_clients` and readable only by that
  supplier, never by the school.
- **The order thread is reachable from three places** — a header messages button with an
  unread badge, a `/messages` list, and a badge on the order's Thread tab. The chat always
  worked; it was unreachable unless you already knew to open an order and click the third
  tab. Unread counts exclude system events, and read markers stay local (never enqueued).
  See `docs/07`.
- **Units of measure are spelled out, never abbreviated, wherever someone chooses or
  reads a quantity.** "bot" is obvious to whoever typed it and to nobody else. `UNIT_LABEL`
  / `UNIT_PLURAL` / `formatQty` in `types` are the only place plurals are formed — English
  plurals are not a suffix, and "Boxs" shipped once already. Items also carry `pack_size`
  ("500 per ream") so a buyer knows what one unit contains.
- **Inventory is an append-only ledger, not a mutable counter.** Every movement writes a
  `stock_moves` row carrying `balance_after`, so history reads without replaying the ledger
  and a wrong balance is visible against the moves that produced it. Stock clamps at zero —
  a ledger implying −3 boxes on hand is a ledger nobody trusts. Accepting a PO draws stock
  down, because acceptance is the point a supplier commits to filling it; declining returns
  it. An item with no reorder level and no stock reads "not tracked" rather than "out", so
  a supplier who never counted their shelves does not open the app to a wall of red. Stock
  levels are supplier-only in RLS: a school has no business reading how thin a vendor's
  shelves are before negotiating.
- **Long lists are paginated client-side.** `usePaged` + `<Pager>` cover the PR wizard's
  item picker (10/page), the supplier catalog (12/page) and the order lists (15/page).
  Selections in the wizard are keyed by item id, so they survive paging and searching; a
  "Selected (n)" filter lets a buyer review picks without hunting pages. Server-side
  paging becomes worthwhile only once a tenant's catalog stops fitting in IndexedDB, which
  the offline layer requires it to do anyway.
- **The RFQ prints its price columns blank.** An RFQ asks a supplier to quote; printing
  the catalogue price the platform already holds would defeat the point of soliciting one.
  Its number is derived from the purchase request (`PR-…` becomes `RFQ-…`) rather than
  stored — there is one RFQ per request, and a separate sequence would mean writing a
  document number to the record merely because somebody opened a preview. Available from
  `pr_approved`, since you cannot solicit quotes on a request nobody approved. See
  `docs/03`.
- **Order payment is cheque-only, by design.** A DepEd disbursement is released as a
  cheque against the DV; there is no cash, transfer or e-wallet path in the workflow and
  none should be added. The school captures the cheque image and **both parties download
  it** — the supplier needs it with the DV and 2307 for their own books. Attaching the
  photo after payment was recorded is supported, since a field photo often arrives after
  the voucher was cut. `subscription_payments` is a different thing entirely: a supplier
  paying the platform's SaaS fee, which is commercial, not government, and uses
  `payment_methods`. See `docs/03`.
- **Payment methods are data.** The owner publishes GCash / Maya / bank accounts (with an
  optional QR upload) and suppliers pay into those; nothing about the destination account
  is hardcoded. Payments snapshot `method_label` so history survives a method being
  renamed or deleted. Dexie v3 backfills both for existing browsers.
- **An account-management page lists the people you manage, never yourself.** The school's
  page shows the admin, the supplier's shows staff. Resetting your *own* password through
  those controls would issue you a temporary one and force a change — which is not what
  "change my password" means — so each portal carries a separate **Change my password**
  path to `/change-password`. Before this, that route was reachable only by the forced
  redirect after an admin reset, so nobody could change their password deliberately.
- **A school is the Principal plus at most one admin.** `school_admin` carries the same
  workflow permissions as `principal`, so the two are interchangeable in the process and
  both see the same requests — but `school.staff` is Principal-only, because an admin able
  to delete the Principal is an admin that can lock a school out of its own account. Every
  `order_events` row snapshots `actor_role`, so the audit trail says whether the Principal
  or the Admin acted, and keeps saying so after the account is deleted.
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
- **Admin-set passwords need an Edge Function.** Setting another user's password in
  Supabase requires the `service_role` key, which must never reach the browser. Local mode
  hashes in the browser and the Supabase path currently sends a reset email; the
  service-role Edge Function is still to build. `must_change_password` and the audit
  columns are already in the schema for it. See `docs/09`.
- **Multi-district / division hierarchy** — out of scope for v1. Flag if the user asks for
  division-level dashboards; `schools.division` and `.district` are already captured.
- **WebUSB / thermal printing** — not applicable to this spec, deliberately skipped.
