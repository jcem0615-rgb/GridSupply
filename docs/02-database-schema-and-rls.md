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

All four require `status = 'active'`. Suspending an account is a button in the Owner
Portal, but the JWT it already holds stays valid until it expires — so without that
clause a stopped account would keep full database access for the rest of its session.
Answering `null` makes every tenant-scoped policy fall through to false at once. The
suspended user can still read their own `profiles` row, because `profiles_select` matches
`auth.uid()` directly, which is what lets the app say *why* they are locked out.

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

`order_events` and `messages` are **insert-and-select only**. There is deliberately no
update or delete policy: the audit trail of a public-funds transaction exists precisely so
that it cannot be rewritten after the fact, and a message quoted in a dispute has to still
read the same tomorrow. Both also bind the writer — `actor_id` / `author_id` must be
`auth.uid()` or null — so an event cannot be filed under someone else's name.

## What RLS cannot say, and the two triggers that can
A policy sees the row as it *would become*; a `WITH CHECK` has no access to the row as it
**was**. Every rule of the form "you may not *move* that column" is therefore outside what
RLS can express, and the schema carries two `BEFORE UPDATE` triggers for exactly those:

**`profiles_guard_privileges`** — `profiles_update_self` has to let you edit your own row
(your name, your position title, the password-change flags). Left at
`using (id = auth.uid()) with check (id = auth.uid())` that is a one-statement privilege
escalation, and it is not theoretical: run against a real Postgres, a `supplier_employee`
executing

```sql
update profiles set role = 'owner', supplier_id = null where id = auth.uid();
```

went from seeing zero schools to reading every school, supplier, order and profile on the
platform. The trigger lets the privileged columns (`role`, `school_id`, `supplier_id`,
`status`) move only for the platform owner, for a Principal acting inside their own school,
or for a Supplier Owner acting inside their own supplier — and **never on your own row**,
which is the clause that closes the escalation.

**`orders_guard_settlement`** — `orders_supplier_update`'s `WITH CHECK` now names the
states a supplier may leave behind (`po_accepted`, `po_declined`, `dispatched`) instead of
just binding `supplier_id`; binding only the tenant let a supplier set its own order to
`paid`. But a policy still cannot restrict *which columns* an `UPDATE` touches, so the
trigger holds the money: a supplier cannot write `check_number`, `paid_at`,
`check_photo_id`, the DV fields, `bir_2307_issued`, `gross_total`, `po_number`, the
approval fields, or `supplier_vat_registered`. The same trigger freezes
`supplier_vat_registered` once `dv_issued_at` is set, for the school too — withholdings on
an issued voucher must not move (`docs/05`).

`handle_new_user()` has no default role, either. It used to fall back to `'principal'`,
which would have handed an account with malformed invite metadata a school Principal's
permissions; a missing role is now a failed insert.

## Running the policies
`npm run rls` applies `supabase/schema.sql` to a throwaway local Postgres and runs
`supabase/tests/02_rls_test.sql` against it as the `authenticated` role — 33 assertions
covering self-escalation, cross-tenant reads and writes, the supplier's permitted order
transitions, the VAT lock, the append-only trail and the suspended-account path.

`supabase/tests/00_shim.sql` supplies stand-ins for the Supabase-managed objects the schema
leans on (`auth.users`, `auth.uid()`, the `authenticated` role, `storage.objects`,
`storage.foldername`). It is a harness only and is never applied to a Supabase project,
which provides all of it. `auth.uid()` reads the same `request.jwt.claim.sub` GUC that
PostgREST sets from the JWT, so the tests exercise the policies through the mechanism
production uses.

Two things this does **not** prove. The shim is not Supabase, so the real `auth` schema,
PostgREST's role switching and the storage policies are still only exercised for the first
time when a project is provisioned. And the order lifecycle is not a state machine in the
database: the trigger constrains what a *supplier* may write, but a school can still move
its own order backwards from `paid`. That is a smaller risk — the school is the withholding
agent and the party the audit trail protects, and every move writes an `order_events` row
that can no longer be deleted — but it is unenforced, not decided.

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
