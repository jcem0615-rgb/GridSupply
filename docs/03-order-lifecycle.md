# 03 — Order lifecycle

Nine steps from request to archive. Implemented in `src/lib/orders.ts`; the permitted actor
for each transition is in `src/lib/permissions.ts`.

| # | Status | Who acts | What happens |
| --- | --- | --- | --- |
| 1 | `draft` | Property Custodian / BAC | PR drafted, `pr_number` assigned |
| 2 | `pr_submitted` | Custodian submits | Waits on the Principal |
| 3 | `pr_approved` | Principal | Approves; `pr_rejected` returns it with a reason |
| 4 | `po_issued` | BAC / Principal | `po_number` assigned, order becomes visible to the supplier |
| 5 | `po_accepted` | Supplier | Accepts; `po_declined` with a reason |
| 6 | `dispatched` | Supplier | Goods leave with a delivery note |
| 7 | `delivered` | Property Custodian | Signs the IAR; `iar_number` assigned |
| 8 | `dv_issued` | Disbursing Officer | DV generated with the withholding breakdown |
| 9 | `paid` → `archived` | Disbursing Officer | Cheque recorded and photographed, BIR 2307 issued, transaction archived |

## Rules
- **Transitions are one-way.** There is no "un-approve". A returned PR goes to `pr_rejected`
  and the custodian edits and resubmits; the audit trail keeps both attempts.
- **Every transition writes an `order_events` row and injects a system message** into the
  order thread, so the chat is a complete narrative of the order.
- **The supplier's window opens at step 4 and never closes.** They see the order from
  `po_issued` onward, including the DV and 2307 that concern their own money.
- **Document numbers are assigned at the transition that creates the document**, not at
  draft time, so a cancelled PR does not burn a PO number.
