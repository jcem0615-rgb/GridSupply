import type { TaxConfig } from '../types'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n || 0)

/** Supplier markup: base cost -> VAT-inclusive price quoted to the school. */
export function sellingPrice(baseCost: number, markupPct: number) {
  return round2(baseCost * (1 + markupPct / 100))
}

export interface TaxBreakdown {
  /** Whether this was computed as a VAT-registered supply. */
  vatRegistered: boolean
  /** Amount billed by the supplier — VAT-inclusive when the supplier is VAT-registered. */
  gross: number
  /** The tax base every withholding is computed on. */
  netOfVat: number
  vat: number
  /** Expanded withholding tax on goods (BIR ATC WC158, 1%). */
  ewt: number
  /** Final VAT withheld on government purchases (ATC WV010, 5%). VAT-registered only. */
  vatWithheld: number
  /** Percentage tax withheld from a non-VAT supplier (ATC WB080). Zero otherwise. */
  percentageTax: number
  totalWithheld: number
  /** What the cheque is actually cut for. */
  netPayable: number
}

/**
 * Government purchase, branching on the supplier's VAT registration.
 *
 * **VAT-registered.** The billed amount is VAT-inclusive, so VAT is stripped
 * out first and both withholdings are computed on the amount NET of VAT, never
 * on the gross — computing on the gross over-withholds by 12% and is the most
 * common manual error this app removes.
 *
 * **Non-VAT.** There is no VAT embedded, so the billed amount *is* the tax
 * base. The 5% final VAT withholding does not apply — it exists to capture VAT
 * a non-VAT supplier never charged. Percentage tax is withheld in its place.
 *
 * Every rate comes from `tax_config`; see docs/05.
 */
export function computeTax(gross: number, cfg: TaxConfig, vatRegistered: boolean): TaxBreakdown {
  const g = round2(gross)
  const netOfVat = vatRegistered ? round2(g / (1 + cfg.vat_rate)) : g
  const vat = vatRegistered ? round2(g - netOfVat) : 0
  const ewt = round2(netOfVat * cfg.ewt_rate)
  const vatWithheld = vatRegistered ? round2(netOfVat * cfg.final_vat_withheld_rate) : 0
  const percentageTax = vatRegistered ? 0 : round2(netOfVat * cfg.percentage_tax_rate)
  const totalWithheld = round2(ewt + vatWithheld + percentageTax)
  return {
    vatRegistered,
    gross: g,
    netOfVat,
    vat,
    ewt,
    vatWithheld,
    percentageTax,
    totalWithheld,
    netPayable: round2(g - totalWithheld),
  }
}

/** BIR quarter label for a date, e.g. "1st Quarter 2026". */
export function birQuarter(iso: string) {
  const d = new Date(iso)
  const q = Math.floor(d.getMonth() / 3) + 1
  const suffix = ['1st', '2nd', '3rd', '4th'][q - 1]
  return `${suffix} Quarter ${d.getFullYear()}`
}

export function quarterRange(iso: string) {
  const d = new Date(iso)
  const q = Math.floor(d.getMonth() / 3)
  const from = new Date(d.getFullYear(), q * 3, 1)
  const to = new Date(d.getFullYear(), q * 3 + 3, 0)
  return { from, to }
}
