# 06 — PWA and offline strategy

## Why offline-first, not offline-tolerant
The two moments this app exists for — accepting a delivery in a stockroom, photographing a
cheque — are exactly the moments with no signal. So IndexedDB is the primary store and the
network is an optimisation, not a prerequisite.

## Layers
| Layer | File | Role |
| --- | --- | --- |
| Local store | `src/lib/db/dexie.ts` | Dexie tables mirroring every Postgres table, plus `outbox` |
| Write path | `src/lib/db/repo.ts`, `src/lib/orders.ts` | Every mutation writes Dexie **and** enqueues an outbox entry |
| Sync | `src/lib/sync.ts` | Drains the outbox to Supabase; retries with attempt counts and last error |
| Service worker | `public/sw.js` | App-shell caching, Background Sync, Web Push |

## Idempotency
Every outbox entry carries a `client_uuid`, generated on the device before the row exists
server-side. Sync upserts with `onConflict: 'client_uuid'`. A batch that half-succeeds and
is replayed therefore **updates** the rows it already created instead of duplicating them —
the single most important property of the whole layer.

`orders`, `messages` and `subscription_payments` carry a `unique` constraint on
`client_uuid` in Postgres so the database enforces this, not just the client.

## Conflict rules
1. **Last write wins per row**, because the workflow is a state machine with a single valid
   actor per step — two people cannot legitimately approve the same PR at the same time.
2. **Server state wins for columns the client did not touch.** The outbox stores the full
   row, so a stale field can overwrite a fresh one; keep outbox entries narrow when adding
   new partial-update paths.
3. **Rejected transitions surface, they do not silently drop.** A failed entry keeps its
   `attempts` count and `last_error` and stays in the outbox for inspection.

## Service worker caching
- **App shell** (navigations, JS, CSS): stale-while-revalidate against a versioned cache,
  with `/index.html` as the offline fallback so a cold launch boots.
- **Supabase REST / Auth / Storage / Realtime**: never cached. Serving a stale approval
  would be worse than showing nothing.
- **Background Sync**: the `gridsupply-outbox` tag messages open clients to flush. Safari
  does not implement Background Sync, so `sync.ts` also polls every 30s and on `online`.

## Camera capture
`<input type="file" accept="image/*" capture="environment">` is reliable on Android and in
an iOS Safari tab, but inconsistent in an installed iOS PWA. `PhotoCapture` therefore always
offers a plain file-picker alongside the camera button. Images are downscaled to 1600px on
canvas before storage — a phone photo is 4–8MB, which is unkind to both IndexedDB and the
eventual Storage upload.
