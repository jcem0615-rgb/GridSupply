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
