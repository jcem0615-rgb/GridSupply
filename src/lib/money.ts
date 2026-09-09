import type { TaxConfig } from '../types'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n || 0)

/** Supplier markup: base cost -> VAT-inclusive price quoted to the school. */
export function sellingPrice(baseCost: number, markupPct: number) {
  return round2(baseCost * (1 + markupPct / 100))
}

export interface TaxBreakdown {
  /** VAT-inclusive amount billed by the supplier. */
  gross: number
  /** Gross net of VAT — the tax base every withholding is computed on. */
  netOfVat: number
  vat: number
  /** Expanded withholding tax on goods (BIR ATC WC158, 1%). */
  ewt: number
  /** Final VAT withheld on government purchases (ATC WV010, 5%). */
  vatWithheld: number
  totalWithheld: number
  /** What the cheque is actually cut for. */
  netPayable: number
}

/**
 * Government purchase from a VAT-registered supplier.
 * Withholdings are computed on the amount NET of VAT, never on the gross —
 * see docs/05-tax-and-financial-calculations.md.
 */
export function computeTax(gross: number, cfg: TaxConfig): TaxBreakdown {
  const g = round2(gross)
  const netOfVat = round2(g / (1 + cfg.vat_rate))
  const vat = round2(g - netOfVat)
  const ewt = round2(netOfVat * cfg.ewt_rate)
  const vatWithheld = round2(netOfVat * cfg.final_vat_withheld_rate)
  const totalWithheld = round2(ewt + vatWithheld)
  return {
    gross: g,
    netOfVat,
    vat,
    ewt,
    vatWithheld,
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
