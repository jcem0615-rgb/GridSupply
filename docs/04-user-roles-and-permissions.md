# 04 — Roles and permissions

`src/lib/permissions.ts` is the single source of truth. Two checks compose:

- `can(role, permission)` — is this role ever allowed to do this?
- `canActNow(role, permission, status)` — and is the order at the right step?

The UI renders an action only when `canActNow` passes, so a user never sees a button they
cannot press.

## Four roles

| Role | Portal | Scope |
| --- | --- | --- |
| `owner` | Owner | The whole platform; belongs to no tenant |
| `principal` | School | One account per school, performing every school-side step |
| `supplier_owner` | Supplier | The supplier, including pricing and billing |
| `supplier_employee` | Supplier | The supplier, minus pricing and billing |

## Matrix

| Permission | Roles | Valid at status |
| --- | --- | --- |
| `pr.create` / `pr.edit` / `pr.submit` | principal | `draft` |
| `pr.approve` / `pr.reject` | principal | `pr_submitted` |
| `po.issue` | principal | `pr_approved` |
| `po.accept` | supplier_owner, supplier_employee | `po_issued` |
| `po.decline` | supplier_owner | `po_issued` |
| `delivery.dispatch` | supplier_owner, supplier_employee | `po_accepted` |
| `delivery.receive` | principal | `dispatched` |
| `dv.issue` | principal | `delivered` |
| `check.capture` | principal | `dv_issued` |
| `bir2307.issue` | principal | `paid` |
| `catalog.manage` | supplier_owner, supplier_employee | any |
| `catalog.pricing` | supplier_owner **only** | any |
| `supplier.staff` | supplier_owner | any |
| `subscription.pay` | supplier_owner | any |
| `subscription.review` | owner | any |
| `accounts.manage` / `branding.manage` | owner | any |
| `payment.methods.manage` | owner | any |
| `template.customize` | principal | any |

## Notes
- **One school login, not one per officer.** A school is a single Principal account. The
  Property Custodian, BAC Chairperson and Disbursing Officer who sign the documents are
  named per template in `print_templates.signatories` (`docs/08`) — they appear on the
  paper without needing accounts, so onboarding a school is one invite rather than four.
- **What this trades away.** Separation of duties is no longer enforced by the software:
  the person who raises the PR is the person who approves it and records the cheque. The
  printed trail still names distinct signatories, and `order_events` still timestamps each
  act separately, but if a deployment needs the control enforced rather than documented,
  re-splitting `principal` into per-officer roles is a change to this file, the
  `user_role` enum, and the two RLS policies that name a role.
- **An employee can sell but not price.** `catalog.manage` lets an employee add and edit
  items; `catalog.pricing` gates `base_cost` and the markup slider to the owner. The margin
  is the owner's business, not the sales associate's.
- **Client-side checks are UX, not security.** The same rules are enforced in RLS.
