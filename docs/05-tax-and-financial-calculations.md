# 05 — Tax and financial calculations

Implemented in `src/lib/money.ts`. Rates come from the `tax_config` table, never from
constants in code — a BIR rate change must be an `UPDATE`, not a deploy.

## Markup
```
selling_price = round2(base_cost × (1 + markup_pct / 100))
```
`selling_price` is the **VAT-inclusive** price quoted to the school. The supplier sets
`markup_pct` with a slider and sees, live, what they actually take home after withholding.

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

### Worked example
Gross ₱1,552.44:

| Line | Amount |
| --- | --- |
| Gross (VAT inclusive) | ₱1,552.44 |
| Net of VAT | ₱1,386.11 |
| VAT (12%) | ₱166.33 |
| Less EWT (1% of 1,386.11) | (₱13.86) |
| Less final VAT withheld (5% of 1,386.11) | (₱69.31) |
| **Net amount due** | **₱1,469.27** |

## BIR Form 2307 field mapping
| 2307 field | Source |
| --- | --- |
| Payee name / TIN / address | `suppliers` |
| Payor name / TIN / address | `schools` (the school is the withholding agent) |
| Period | Calendar quarter of `paid_at` |
| Income payment, line 1 | `net_of_vat`, ATC from `tax_config.ewt_atc` |
| Tax withheld, line 1 | `ewt` |
| Income payment, line 2 | `net_of_vat`, ATC from `tax_config.vat_atc` |
| Tax withheld, line 2 | `vat_withheld` |
| Total tax withheld | `ewt + vat_withheld` |

Both lines carry the same income payment because the two withholdings apply to the same
tax base under different ATCs — that is how the form is filed.

## Rounding
Every intermediate value is rounded to two decimals at the point of computation
(`round2`), not only at display, so the printed DV and the printed 2307 can never disagree
by a centavo.
