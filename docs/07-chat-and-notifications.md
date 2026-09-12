# 07 — Chat and notifications

## Channel design
One Realtime channel per order thread: `order:<order_id>`. The client subscribes to
`INSERT` on `messages` filtered by `order_id`, and writes arriving rows straight into Dexie
— so the live path and the offline path converge on the same store and the UI has one
source of truth.

Visibility is not enforced by the channel name. It is enforced by RLS on `messages` via
`can_see_order()`, so subscribing to another tenant's channel yields nothing.

## Message kinds
| Kind | Author | Example |
| --- | --- | --- |
| `user` | A person, with `author_role` shown | "Delivery arriving before noon today." |
| `system` | Injected by a lifecycle transition | "PO-2026-09-0001 issued to supplier." |

System messages are rendered as centred pills rather than bubbles. Because every transition
in `orders.ts` calls `postSystemMessage`, the thread is a complete, chronological narrative
of the order — which is what a dispute actually needs.

## Reaching the thread
A conversation nobody can find is a conversation nobody uses. The thread lives on the order
(Summary / Documents / **Thread**), and three surfaces lead to it:

- **A messages button in the header**, on every screen and every viewport, carrying a total
  unread badge. It is in the header rather than the bottom nav because the supplier portal
  already has five tabs and a sixth makes them unusable at 390px.
- **`/messages`** — one row per order thread with the counterpart, the last message and an
  unread count, filterable to unread only. Rows deep-link to `/orders/:id?tab=thread`.
- **An unread badge on the Thread tab** of the order itself.

**Unread** means a `user` message written by someone else since this profile last opened
the thread. System events are excluded deliberately: the lifecycle already surfaces those
as status changes, and counting them would leave a permanent badge on every order nobody
has actually chatted about.

Read markers live in the local `thread_reads` table and are **never enqueued to the
outbox** — a read receipt is a per-user UI nicety, and one sync write per thread-open would
swamp the queue that carries purchase orders.

`npm run chat-check` covers these surfaces, including the mobile composer being on screen
without scrolling.

## Attachments
Chat images are stored as attachments and referenced by `attachment_id`. In a wired
deployment they live in `chat-attachments/<order_id>/…`, gated by the same
`can_see_order()` helper.

## Push payload shape
```json
{
  "title": "PO-2026-09-0001 accepted",
  "body": "Northgate School Supplies Trading accepted your purchase order.",
  "url": "/orders/<order_id>",
  "tag": "order-<order_id>"
}
```
`tag` collapses repeat notifications for the same order rather than stacking them.
`notificationclick` focuses an open window and navigates it, falling back to `openWindow`.

Delivery is a Supabase Edge Function triggered on `order_events` insert, which looks up the
subscriptions of the profiles on the other side of the transition — the supplier is not
notified of their own dispatch.
