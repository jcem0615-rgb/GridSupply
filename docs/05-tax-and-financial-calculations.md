# 05 — Tax and financial calculations

Implemented in `src/lib/money.ts`. Rates come from the `tax_config` table, never from
constants in code — a BIR rate change must be an `UPDATE`, not a deploy.

## Markup
```
selling_price = round2(base_cost × (1 + markup_pct / 100))
```
`selling_price` is the **VAT-inclusive** price quoted to the school. The supplier sets
`markup_pct` with a slider and sees, live, what they actually take home after withholding.

## The school chooses the supplier's VAT status
Every order carries `supplier_vat_registered`, defaulted from the supplier's record but
**set by the school** in the PR wizard and correctable on the order until the DV is issued.

It is a **snapshot, not a lookup**. A supplier can register for VAT, or drop below the
threshold, at any time; reading the flag live would restate the tax on vouchers already
printed. Once the DV exists the field is locked outright — the withholdings on an issued
voucher must not move.

The school makes the call rather than the supplier because the school is the withholding
agent: it is the one BIR holds responsible for withholding the right amount, and it should
be checking the supplier's Certificate of Registration.

## Withholding on a government purchase
A DepEd school is a withholding agent. For goods from a VAT-registered supplier, both
withholdings are computed on the amount **net of VAT** — never on the gross. Getting this
backwards over-withholds by 12% and is the most common manual error this app removes.

```
gross         = Σ line_total            (VAT inclusive)
net_of_vat    = gross / (1 + vat_rate)  (0.12 → the tax base)
vat           = gross − net_of_vat

ewt           = net_of_vat × ewt_rate                 (1%, ATC WC158)
vat_withheld  = net_of_vat × final_vat_withheld_rate  (5%, ATC WV010)

net_payable   = gross − ewt − vat_withheld            (what the cheque is cut for)
```

### Non-VAT supplier
There is no VAT embedded in the price, so the billed amount **is** the tax base. The 5%
final VAT withholding does not apply — it exists to capture VAT that a non-VAT supplier
never charged. Percentage tax is withheld in its place.

```
net_of_vat      = gross                       (nothing to strip)
vat             = 0
ewt             = gross × ewt_rate            (1%, ATC WC158)
percentage_tax  = gross × percentage_tax_rate (ATC WB080)
vat_withheld    = 0
net_payable     = gross − ewt − percentage_tax
```

### Worked example — the same ₱1,552.44 both ways

| Line | VAT-registered | Non-VAT |
| --- | --- | --- |
| Gross billed | ₱1,552.44 | ₱1,552.44 |
| Tax base | ₱1,386.11 | ₱1,552.44 |
| VAT (12%) | ₱166.33 | — |
| Less EWT (1%) | (₱13.86) | (₱15.52) |
| Less final VAT withheld (5%) | (₱69.31) | — |
| Less percentage tax (3%) | — | (₱46.57) |
| **Net amount due** | **₱1,469.27** | **₱1,490.35** |

> **Confirm `percentage_tax_rate` with your accountant.** It ships at 3%, the standing
> rate under Section 116, but it was temporarily reduced to 1% under CREATE. Like every
> other rate it lives in `tax_config`, so correcting it is an `UPDATE`, not a deploy.

## BIR Form 2307 field mapping
| 2307 field | Source |
| --- | --- |
| Payee name / TIN / address | `suppliers` |
| Payor name / TIN / address | `schools` (the school is the withholding agent) |
| Period | Calendar quarter of `paid_at` |
| Income payment, line 1 | `net_of_vat`, ATC from `tax_config.ewt_atc` |
| Tax withheld, line 1 | `ewt` |
| Income payment, line 2 | `net_of_vat`, ATC from `tax_config.vat_atc` (VAT-registered) or `percentage_tax_atc` (non-VAT) |
| Tax withheld, line 2 | `vat_withheld`, or `percentage_tax` for a non-VAT supplier |
| Total tax withheld | `ewt + vat_withheld` |

Both lines carry the same income payment because the two withholdings apply to the same
tax base under different ATCs — that is how the form is filed.

## Rounding
Every intermediate value is rounded to two decimals at the point of computation
(`round2`), not only at display, so the printed DV and the printed 2307 can never disagree
by a centavo.
