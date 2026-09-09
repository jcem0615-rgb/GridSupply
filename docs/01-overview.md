# 01 — Overview

## The problem
A DepEd public school buys supplies on paper. A Property Custodian writes a Purchase
Request by hand, walks it to the Principal, the BAC types a Purchase Order, the supplier
delivers, someone signs an Inspection & Acceptance Report, the Disbursing Officer prepares
a Disbursement Voucher with withholding tax computed by calculator, cuts a cheque, and
issues a BIR Form 2307 to the supplier. Every step is a physical hand-off, the numbers are
re-keyed four times, and nobody outside the room can see where a request is stuck.

GridSupply digitises that chain end to end, without changing it. The documents that come
out the other side are the same documents an auditor expects.

## Three portals, one deployment
| Portal | Who | What they do |
| --- | --- | --- |
| **Owner** | Platform super-admin | Onboard and pause schools and suppliers, review subscription payments, manage branding assets |
| **School** | Principal, Property Custodian, BAC, Disbursing Officer | PR → approval → PO → receipt → DV → cheque → 2307 |
| **Supplier** | Supplier Owner and employees | Catalog and markup pricing, accept and dispatch POs, download cheque photos and 2307s |

All three run from one codebase against one Supabase project. Tenants are separated by
Row Level Security, never by separate deployments — see `02-database-schema-and-rls.md`.

## Design philosophy
- **The field has no signal.** A custodian receiving a delivery in a stockroom, or an officer
  photographing a cheque, must not need connectivity. Every write lands in IndexedDB first.
- **The paper is the product.** Printed output is the deliverable that satisfies an audit.
  The screen is how you get there.
- **Roles are narrow on purpose.** A user sees only the actions their role can take at the
  order's current step; everything else is absent, not disabled-with-a-tooltip.
- **Numbers are never re-keyed.** The markup a supplier sets flows into the PR, the PR total
  flows into the PO, the PO total drives the DV withholding, and the DV drives the 2307.
