# 04 — Roles and permissions

`src/lib/permissions.ts` is the single source of truth. Two checks compose:

- `can(role, permission)` — is this role ever allowed to do this?
- `canActNow(role, permission, status)` — and is the order at the right step?

The UI renders an action only when `canActNow` passes, so a user never sees a button they
cannot press.

## Matrix

| Permission | Roles | Valid at status |
| --- | --- | --- |
| `pr.create` / `pr.edit` / `pr.submit` | custodian, bac | `draft` |
| `pr.approve` / `pr.reject` | principal | `pr_submitted` |
| `po.issue` | bac, principal | `pr_approved` |
| `po.accept` | supplier_owner, supplier_employee | `po_issued` |
| `po.decline` | supplier_owner | `po_issued` |
| `delivery.dispatch` | supplier_owner, supplier_employee | `po_accepted` |
| `delivery.receive` | custodian | `dispatched` |
| `dv.issue` | disbursing | `delivered` |
| `check.capture` | disbursing | `dv_issued` |
| `bir2307.issue` | disbursing | `paid` |
| `catalog.manage` | supplier_owner, supplier_employee | any |
| `catalog.pricing` | supplier_owner **only** | any |
| `supplier.staff` | supplier_owner | any |
| `subscription.pay` | supplier_owner | any |
| `subscription.review` | owner | any |
| `accounts.manage` / `branding.manage` | owner | any |
| `template.customize` | principal, custodian | any |

## Notes
- **An employee can sell but not price.** `catalog.manage` lets an employee add and edit
  items; `catalog.pricing` gates `base_cost` and the markup slider to the owner. The margin
  is the owner's business, not the sales associate's.
- **The Principal can issue a PO** as well as the BAC, because small schools run a one-person
  BAC in practice and blocking that would push the work back onto paper.
- **Client-side checks are UX, not security.** The same rules are enforced in RLS; a crafted
  request from a custodian still cannot approve their own PR.
