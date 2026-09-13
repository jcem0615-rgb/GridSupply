# 03 — Order lifecycle

Nine steps from request to archive. Implemented in `src/lib/orders.ts`; the permitted actor
for each transition is in `src/lib/permissions.ts`.

| # | Status | Who acts | What happens |
| --- | --- | --- | --- |
| 1 | `draft` | Principal | PR drafted, `pr_number` assigned |
| 2 | `pr_submitted` | Principal | PR finalised and submitted for approval |
| 3 | `pr_approved` | Principal | Approves; `pr_rejected` returns it with a reason |
| 4 | `po_issued` | Principal | `po_number` assigned, order becomes visible to the supplier |
| 5 | `po_accepted` | Supplier | Accepts; `po_declined` with a reason |
| 6 | `dispatched` | Supplier | Goods leave with a delivery note |
| 7 | `delivered` | Principal | Signs the IAR; `iar_number` assigned |
| 8 | `dv_issued` | Principal | DV generated with the withholding breakdown |
| 9 | `paid` → `archived` | Principal | Cheque recorded and photographed, BIR 2307 issued, transaction archived |

## Documents produced along the way
| Document | Available from | Notes |
| --- | --- | --- |
| Purchase Request | `draft` | The request itself |
| **Request for Quotation** | `pr_approved` | Solicits the supplier's price; the price columns print **blank** |
| Purchase Order | `po_issued` | The commitment to buy |
| Inspection & Acceptance Report | `delivered` | Goods received and accepted |
| Disbursement Voucher | `dv_issued` | With the withholding breakdown |
| BIR Form 2307 | `paid` | Certificate of tax withheld |

The RFQ deliberately rules its price columns and leaves them empty. Printing the catalogue
price the platform already holds would defeat the point of asking a supplier to quote. It
carries the standard small-value-procurement terms and a block for the supplier to sign.

Its number is **derived** from the purchase request (`PR-2026-09-0007` becomes
`RFQ-2026-09-0007`) rather than stored. There is one RFQ per request, and assigning a
separate sequence would mean writing a document number to the record merely because
somebody opened the preview.

## Payment is by cheque, and only by cheque
A DepEd disbursement is released as a cheque against the Disbursement Voucher. There is no
cash, transfer or e-wallet path in the order workflow, and none should be added — the
voucher, the cheque number and the BIR 2307 are one chain an auditor follows end to end.

The school captures the cheque image (`check_photo_id`), and **both parties can download
it**: the supplier needs the cheque alongside the DV and the 2307 for their own books. The
image can be attached after the payment was recorded, because a cheque photographed in the
field often arrives later than the voucher was cut.

Do not confuse this with `subscription_payments`, which is the supplier paying the platform
its SaaS fee. That is a private commercial transaction between two businesses, not a
government disbursement, and it uses the owner-published methods in `payment_methods`.

## Rules
- **Transitions are one-way.** There is no "un-approve". A returned PR goes to `pr_rejected`
  and is edited and resubmitted; the audit trail keeps both attempts.
- **`pr_submitted` survives even with one school account.** Drafting and approving are still
  two recorded acts with two timestamps, because the printed PR carries a "Requested by" and
  an "Approved by" block that an auditor expects to have happened in that order.
- **Every transition writes an `order_events` row and injects a system message** into the
  order thread, so the chat is a complete narrative of the order.
- **The supplier's window opens at step 4 and never closes.** They see the order from
  `po_issued` onward, including the DV and 2307 that concern their own money.
- **Document numbers are assigned at the transition that creates the document**, not at
  draft time, so a cancelled PR does not burn a PO number.
