import { peso, computeTax, birQuarter } from '../../lib/money'
import { formatDate } from '../../lib/ids'
import type {
  Attachment,
  Order,
  OrderLine,
  PrintTemplate,
  School,
  Supplier,
  TaxConfig,
} from '../../types'

export type DocType = 'PR' | 'PO' | 'IAR' | 'DV' | 'BIR2307'

export const DOC_TITLE: Record<DocType, string> = {
  PR: 'Purchase Request',
  PO: 'Purchase Order',
  IAR: 'Inspection & Acceptance Report',
  DV: 'Disbursement Voucher',
  BIR2307: 'BIR Form 2307',
}

interface DocProps {
  type: DocType
  order: Order
  lines: OrderLine[]
  school: School
  supplier: Supplier | null
  tax: TaxConfig
  template?: PrintTemplate | null
  logo?: Attachment | null
  checkPhoto?: Attachment | null
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-2 py-0.5">
    <span className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</span>
    <span className="text-[11px] text-neutral-900">{value}</span>
  </div>
)

function Letterhead({ school, template, logo, title }: { school: School; template?: PrintTemplate | null; logo?: Attachment | null; title: string }) {
  const lines = template?.header_lines?.length
    ? template.header_lines
    : ['Republic of the Philippines', 'Department of Education', school.division, school.district]
  return (
    <header className="mb-5 border-b-2 border-neutral-900 pb-3 text-center">
      <div className="flex items-center justify-center gap-4">
        {template?.show_seal !== false && (
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-neutral-300">
            {logo ? (
              <img src={logo.data_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[8px] font-bold text-neutral-400">
                SEAL
              </div>
            )}
          </div>
        )}
        <div>
          {lines.map((l, i) => (
            <p key={i} className={i === 1 ? 'text-[13px] font-black uppercase' : 'text-[10px] uppercase tracking-wide'}>
              {l}
            </p>
          ))}
          <p className="mt-0.5 text-[12px] font-bold uppercase">{school.name}</p>
          <p className="text-[9px] text-neutral-500">{school.address}</p>
        </div>
      </div>
      <h1 className="mt-3 text-[15px] font-black uppercase tracking-[0.15em]">{title}</h1>
    </header>
  )
}

function Signatories({ template, fallback }: { template?: PrintTemplate | null; fallback: { label: string; name: string; title: string }[] }) {
  const sigs = template?.signatories?.length ? template.signatories : fallback
  return (
    <div className="mt-8 grid grid-cols-2 gap-8">
      {sigs.map((s, i) => (
        <div key={i}>
          <p className="text-[10px] uppercase text-neutral-500">{s.label}</p>
          <p className="mt-6 border-b border-neutral-900 pb-0.5 text-center text-[12px] font-bold uppercase">{s.name || ' '}</p>
          <p className="text-center text-[9px] text-neutral-500">{s.title}</p>
        </div>
      ))}
    </div>
  )
}

function LineTable({ lines, showPrices = true }: { lines: OrderLine[]; showPrices?: boolean }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-neutral-100">
          <th className="border border-neutral-400 px-2 py-1 text-left">Item</th>
          <th className="border border-neutral-400 px-2 py-1 text-center">Unit</th>
          <th className="border border-neutral-400 px-2 py-1 text-right">Qty</th>
          {showPrices && <th className="border border-neutral-400 px-2 py-1 text-right">Unit Cost</th>}
          {showPrices && <th className="border border-neutral-400 px-2 py-1 text-right">Amount</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id}>
            <td className="border border-neutral-400 px-2 py-1">
              <span className="font-semibold">{l.name}</span>
              {l.description && <span className="block text-[9px] text-neutral-500">{l.description}</span>}
            </td>
            <td className="border border-neutral-400 px-2 py-1 text-center">{l.unit}</td>
            <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{l.qty}</td>
            {showPrices && <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(l.unit_price)}</td>}
            {showPrices && <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(l.line_total)}</td>}
          </tr>
        ))}
        {Array.from({ length: Math.max(0, 5 - lines.length) }).map((_, i) => (
          <tr key={`pad-${i}`}>
            <td className="border border-neutral-400 px-2 py-2">&nbsp;</td>
            <td className="border border-neutral-400" />
            <td className="border border-neutral-400" />
            {showPrices && <td className="border border-neutral-400" />}
            {showPrices && <td className="border border-neutral-400" />}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PrintDoc(props: DocProps) {
  const { type, order, lines, school, supplier, tax, template, logo, checkPhoto } = props
  const t = computeTax(order.gross_total, tax, order.supplier_vat_registered)

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-neutral-900 shadow-sm">
      <Letterhead school={school} template={template} logo={logo} title={DOC_TITLE[type]} />

      {type === 'PR' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div>
              <Row label="PR No." value={order.pr_number} />
              <Row label="Date" value={formatDate(order.created_at)} />
            </div>
            <div>
              <Row label="Fund Source" value={order.fund_source} />
              <Row label="School ID" value={school.school_id_number} />
            </div>
          </div>
          <LineTable lines={lines} />
          <div className="mt-2 flex justify-end">
            <div className="w-64">
              <div className="flex justify-between border-t-2 border-neutral-900 pt-1 text-[12px] font-black">
                <span>TOTAL</span>
                <span className="tabular-nums">{peso(order.gross_total)}</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px]">
            <span className="font-bold uppercase">Purpose: </span>
            {order.purpose}
          </p>
          <Signatories
            template={template}
            fallback={[
              { label: 'Requested by', name: '', title: 'Property Custodian' },
              { label: 'Approved by', name: '', title: 'School Principal' },
            ]}
          />
        </>
      )}

      {type === 'PO' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div>
              <Row label="PO No." value={order.po_number ?? '—'} />
              <Row label="Date" value={formatDate(order.po_issued_at)} />
              <Row label="Ref. PR No." value={order.pr_number} />
            </div>
            <div>
              <Row label="Supplier" value={supplier?.name ?? '—'} />
              <Row label="TIN" value={supplier?.tin ?? '—'} />
              <Row label="Address" value={supplier?.address ?? '—'} />
            </div>
          </div>
          <p className="mb-2 text-[11px]">
            Please furnish this Office the following articles subject to the terms and conditions herein.
          </p>
          <LineTable lines={lines} />
          <div className="mt-2 flex justify-end">
            <div className="w-64">
              <div className="flex justify-between border-t-2 border-neutral-900 pt-1 text-[12px] font-black">
                <span>TOTAL</span>
                <span className="tabular-nums">{peso(order.gross_total)}</span>
              </div>
            </div>
          </div>
          <Signatories
            template={template}
            fallback={[
              { label: 'Conforme (Supplier)', name: supplier?.owner_name ?? '', title: supplier?.name ?? '' },
              { label: 'Very truly yours', name: '', title: 'School Principal' },
            ]}
          />
        </>
      )}

      {type === 'IAR' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div>
              <Row label="IAR No." value={order.iar_number ?? '—'} />
              <Row label="Date" value={formatDate(order.delivered_at)} />
            </div>
            <div>
              <Row label="PO No." value={order.po_number ?? '—'} />
              <Row label="Supplier" value={supplier?.name ?? '—'} />
            </div>
          </div>
          <LineTable lines={lines} showPrices={false} />
          <div className="mt-4 border border-neutral-400 p-3 text-[11px]">
            <p className="font-bold uppercase">Inspection & Acceptance</p>
            <p className="mt-1">
              Inspected, verified and found in order as to quantity and specifications. Complete delivery accepted on{' '}
              {formatDate(order.delivered_at)}.
            </p>
            {order.iar_signature && (
              <p className="mt-3 text-[12px]" style={{ fontFamily: 'cursive' }}>
                {order.iar_signature}
              </p>
            )}
          </div>
          <Signatories
            template={template}
            fallback={[
              { label: 'Inspected by', name: '', title: 'Inspection Committee' },
              { label: 'Accepted by', name: order.iar_signature ?? '', title: 'Property Custodian' },
            ]}
          />
        </>
      )}

      {type === 'DV' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div>
              <Row label="DV No." value={order.dv_number ?? '—'} />
              <Row label="Date" value={formatDate(order.dv_issued_at)} />
              <Row label="Fund" value={order.fund_source} />
            </div>
            <div>
              <Row label="Payee" value={supplier?.name ?? '—'} />
              <Row label="TIN" value={supplier?.tin ?? '—'} />
              <Row label="Address" value={supplier?.address ?? '—'} />
            </div>
          </div>
          <p className="mb-2 text-[11px]">
            <span className="font-bold uppercase">Particulars: </span>
            Payment for {order.purpose} per {order.po_number ?? order.pr_number} and {order.iar_number ?? 'IAR'}.
          </p>
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              <tr>
                <td className="border border-neutral-400 px-2 py-1">
                  {t.vatRegistered ? 'Gross amount (VAT inclusive)' : 'Gross amount (non-VAT supplier)'}
                </td>
                <td className="w-40 border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(t.gross)}</td>
              </tr>
              {t.vatRegistered && (
                <>
                  <tr>
                    <td className="border border-neutral-400 px-2 py-1 pl-6 text-neutral-600">Amount net of VAT (tax base)</td>
                    <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums text-neutral-600">{peso(t.netOfVat)}</td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-400 px-2 py-1 pl-6 text-neutral-600">
                      VAT ({(tax.vat_rate * 100).toFixed(0)}%)
                    </td>
                    <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums text-neutral-600">{peso(t.vat)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td className="border border-neutral-400 px-2 py-1">
                  Less: Expanded withholding tax ({(tax.ewt_rate * 100).toFixed(0)}% · {tax.ewt_atc})
                </td>
                <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">({peso(t.ewt)})</td>
              </tr>
              {t.vatRegistered ? (
                <tr>
                  <td className="border border-neutral-400 px-2 py-1">
                    Less: Final VAT withheld ({(tax.final_vat_withheld_rate * 100).toFixed(0)}% · {tax.vat_atc})
                  </td>
                  <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">({peso(t.vatWithheld)})</td>
                </tr>
              ) : (
                t.percentageTax > 0 && (
                  <tr>
                    <td className="border border-neutral-400 px-2 py-1">
                      Less: Percentage tax withheld ({(tax.percentage_tax_rate * 100).toFixed(0)}% ·{' '}
                      {tax.percentage_tax_atc})
                    </td>
                    <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">
                      ({peso(t.percentageTax)})
                    </td>
                  </tr>
                )
              )}
              <tr className="bg-neutral-100 font-black">
                <td className="border border-neutral-400 px-2 py-1.5">NET AMOUNT DUE</td>
                <td className="border border-neutral-400 px-2 py-1.5 text-right tabular-nums">{peso(t.netPayable)}</td>
              </tr>
            </tbody>
          </table>

          {(order.check_number || checkPhoto) && (
            <div className="mt-4 border border-neutral-400 p-3">
              <p className="text-[10px] font-bold uppercase">Payment</p>
              <Row label="Cheque No." value={order.check_number ?? '—'} />
              <Row label="Date paid" value={formatDate(order.paid_at)} />
              {checkPhoto && (
                <img src={checkPhoto.data_url} alt="Cheque" className="mt-2 max-h-44 rounded border border-neutral-300 object-contain" />
              )}
            </div>
          )}

          <Signatories
            template={template}
            fallback={[
              { label: 'Certified: funds available', name: '', title: 'Disbursing Officer' },
              { label: 'Approved for payment', name: '', title: 'School Principal' },
            ]}
          />
        </>
      )}

      {type === 'BIR2307' && (
        <>
          <p className="mb-3 text-center text-[10px] uppercase tracking-wide text-neutral-500">
            Certificate of Creditable Tax Withheld at Source
          </p>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div className="border border-neutral-400 p-2">
              <p className="mb-1 text-[10px] font-bold uppercase">Payee</p>
              <Row label="Name" value={supplier?.name ?? '—'} />
              <Row label="TIN" value={supplier?.tin ?? '—'} />
              <Row label="Address" value={supplier?.address ?? '—'} />
            </div>
            <div className="border border-neutral-400 p-2">
              <p className="mb-1 text-[10px] font-bold uppercase">Payor (Withholding Agent)</p>
              <Row label="Name" value={school.name} />
              <Row label="TIN" value={school.tin} />
              <Row label="Address" value={school.address} />
            </div>
          </div>
          <Row label="For the period" value={birQuarter(order.paid_at ?? order.dv_issued_at ?? order.created_at)} />
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-neutral-400 px-2 py-1 text-left">Income payment subject to withholding</th>
                <th className="border border-neutral-400 px-2 py-1 text-center">ATC</th>
                <th className="border border-neutral-400 px-2 py-1 text-right">Amount of income payment</th>
                <th className="border border-neutral-400 px-2 py-1 text-right">Tax withheld</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-neutral-400 px-2 py-1">
                  Income payments to suppliers of goods ({(tax.ewt_rate * 100).toFixed(0)}%)
                </td>
                <td className="border border-neutral-400 px-2 py-1 text-center">{tax.ewt_atc}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(t.netOfVat)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(t.ewt)}</td>
              </tr>
              {t.vatRegistered ? (
                <tr>
                  <td className="border border-neutral-400 px-2 py-1">
                    Final VAT withheld on government purchases ({(tax.final_vat_withheld_rate * 100).toFixed(0)}%)
                  </td>
                  <td className="border border-neutral-400 px-2 py-1 text-center">{tax.vat_atc}</td>
                  <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(t.netOfVat)}</td>
                  <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(t.vatWithheld)}</td>
                </tr>
              ) : (
                t.percentageTax > 0 && (
                  <tr>
                    <td className="border border-neutral-400 px-2 py-1">
                      Percentage tax on government money payments ({(tax.percentage_tax_rate * 100).toFixed(0)}%)
                    </td>
                    <td className="border border-neutral-400 px-2 py-1 text-center">{tax.percentage_tax_atc}</td>
                    <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">{peso(t.netOfVat)}</td>
                    <td className="border border-neutral-400 px-2 py-1 text-right tabular-nums">
                      {peso(t.percentageTax)}
                    </td>
                  </tr>
                )
              )}
              <tr className="bg-neutral-100 font-black">
                <td className="border border-neutral-400 px-2 py-1.5" colSpan={3}>
                  TOTAL TAX WITHHELD
                </td>
                <td className="border border-neutral-400 px-2 py-1.5 text-right tabular-nums">{peso(t.totalWithheld)}</td>
              </tr>
            </tbody>
          </table>
          <Signatories
            template={template}
            fallback={[
              { label: 'Payor / Authorized representative', name: '', title: 'Disbursing Officer' },
              { label: 'Payee / Authorized representative', name: supplier?.owner_name ?? '', title: supplier?.name ?? '' },
            ]}
          />
        </>
      )}

      {template?.footer_note && (
        <p className="mt-6 border-t border-neutral-300 pt-2 text-center text-[9px] text-neutral-500">{template.footer_note}</p>
      )}
    </article>
  )
}
