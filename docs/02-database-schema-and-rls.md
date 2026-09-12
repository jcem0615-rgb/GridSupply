# 02 — Database schema and RLS

The authoritative artifact is `supabase/schema.sql`. This document explains its shape.

## Tables
| Table | Purpose |
| --- | --- |
| `schools`, `suppliers` | The two tenant types |
| `profiles` | One row per `auth.users` row: role + exactly one tenant id. **This is the authorization record**; `auth.uid()` is only identity |
| `catalog_items` | Supplier catalog with `base_cost`, `markup_pct`, derived `selling_price` |
| `orders` | One row carries the whole PR → PO → IAR → DV → 2307 chain |
| `order_lines` | Line items |
| `order_events` | Append-only audit trail |
| `messages` | Order chat, including injected system events |
| `payment_methods` | Accounts the owner publishes for suppliers to pay into |
| `subscription_payments` | Supplier proof-of-payment submissions and owner review |
| `tax_config` | VAT / EWT / final-VAT rates and ATC codes as **data** |
| `supplier_clients` | A supplier's private notes on each school it serves |
| `branding`, `print_templates` | Per-tenant visual and document customisation |

## Why one `orders` row, not five document tables
A PR that becomes a PO that becomes a DV is one commercial event with one audit trail.
Splitting it into five tables means five joins to answer "where is this stuck?" and five
places for the status to disagree. The document numbers (`pr_number`, `po_number`,
`dv_number`, `iar_number`) are columns that fill in as the order advances.

## RLS pattern
Four `SECURITY DEFINER` helpers read the caller's profile without recursing through
`profiles`' own policy: `auth_role()`, `auth_school_id()`, `auth_supplier_id()`, `is_owner()`.

Every policy is then one of three shapes:

```sql
-- owner sees all
is_owner()
-- school-scoped
school_id = auth_school_id()
-- supplier-scoped
supplier_id = auth_supplier_id()
```

**The one rule that matters most:** a supplier must not see a school's internal
deliberation. `orders_select` grants supplier access only once a PO exists:

```sql
supplier_id = auth_supplier_id()
and status not in ('draft','pr_submitted','pr_approved','pr_rejected')
```

Child tables (`order_lines`, `order_events`, `messages`) inherit that decision through
`can_see_order(uuid)` rather than repeating it, so the rule has exactly one definition.

## Supplier clients
`supplier_clients` is the supplier's own CRM record for a school: contact person, delivery
notes, internal notes. It is deliberately **not** columns on `schools` — the school's name,
TIN and address print on the PO, DV and BIR 2307, so they are the school's to maintain and
a supplier must never write them.

The policy is one-sided on purpose: `supplier_clients_all` grants the owning supplier full
access and there is **no school-side select policy at all**, so a school cannot read what a
vendor has written about it.

## Payment methods
The destination account for the subscription fee is data, not configuration. The owner
maintains `payment_methods` (GCash, Maya, bank transfer, each with an optional QR image),
and `payment_methods_select` lets **every** signed-in user read them — a supplier who
cannot see the account cannot pay into it. Only `is_owner()` may write.

`subscription_payments.payment_method_id` is `on delete set null` and sits beside
`method_label`, a snapshot of the method's name taken at submission. Deleting a retired
account therefore never rewrites what a past payment says it was paid into.

## Storage
Four private buckets, each keyed by a tenant-id path prefix enforced in the policy:

```
payment-proofs/<supplier_id>/…    check-photos/<school_id>/…
branding/…                        chat-attachments/<order_id>/…
```

Because the policy checks `storage.foldername(name)[1]`, School A cannot mint a signed URL
for Supplier B's GCash screenshot even with a valid session.

## Auth wiring
`handle_new_user()` fires on `auth.users` insert and creates the `profiles` row from invite
metadata (`role`, `school_id` / `supplier_id`, `full_name`). An admin invites a user from
the Supabase dashboard with that metadata; there is no self-service sign-up, which is
correct for a closed government procurement system.
