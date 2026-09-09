import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { computeTax, peso } from '../../lib/money'
import { formatDate, formatDateTime } from '../../lib/ids'
import { getTaxConfig } from '../../lib/db/seed'
import { Button, Card, Empty, StatusPill, cx } from '../../components/ui'
import { OrderActions } from './OrderActions'
import { OrderChat } from './OrderChat'
import { PrintDoc, DOC_TITLE, type DocType } from '../print/PrintDocs'
import { ORDER_FLOW, ROLE_PORTAL, type OrderStatus } from '../../types'

const TABS = ['Summary', 'Documents', 'Thread'] as const

/** Which printable documents exist at a given point in the lifecycle. */
function availableDocs(status: OrderStatus): DocType[] {
  const docs: DocType[] = ['PR']
  const i = ORDER_FLOW.indexOf(status)
  const at = (s: OrderStatus) => i >= ORDER_FLOW.indexOf(s)
  if (at('po_issued')) docs.push('PO')
  if (at('delivered')) docs.push('IAR')
  if (at('dv_issued')) docs.push('DV')
  if (at('paid')) docs.push('BIR2307')
  return docs
}

export function OrderDetail() {
  const { id = '' } = useParams()
  const profile = useAuth((s) => s.profile)!
  const [tab, setTab] = useState<(typeof TABS)[number]>('Summary')
  const [doc, setDoc] = useState<DocType>('PR')

  const order = useLiveQuery(() => db.orders.get(id), [id])
  const lines = useLiveQuery(() => db.order_lines.where('order_id').equals(id).toArray(), [id], [])
  const events = useLiveQuery(() => db.order_events.where('order_id').equals(id).reverse().sortBy('created_at'), [id], [])
  const school = useLiveQuery(async () => (order ? db.schools.get(order.school_id) : undefined), [order?.school_id])
  const supplier = useLiveQuery(
    async () => (order?.supplier_id ? db.suppliers.get(order.supplier_id) : undefined),
    [order?.supplier_id],
  )
  const tax = useLiveQuery(() => getTaxConfig(), [])
  const template = useLiveQuery(
    async () =>
      order ? (await db.print_templates.where('school_id').equals(order.school_id).toArray()).find((t) => t.doc_type === doc) : undefined,
    [order?.school_id, doc],
  )
  const logo = useLiveQuery(async () => (await db.attachments.where('kind').equals('logo').toArray())[0], [])
  const checkPhoto = useLiveQuery(
    async () => (order?.check_photo_id ? db.attachments.get(order.check_photo_id) : undefined),
    [order?.check_photo_id],
  )

  if (!order || !school || !tax) {
    return <Empty title="Loading…" hint="If this persists, the request may not exist on this device." />
  }

  const t = computeTax(order.gross_total, tax)
  const backTo = `/${ROLE_PORTAL[profile.role]}/orders`
  const docs = availableDocs(order.status)
  const step = Math.max(0, ORDER_FLOW.indexOf(order.status))

  return (
    <div className="space-y-5">
      <div className="no-print">
        <Link to={backTo} className="text-xs font-semibold text-ink-400 hover:text-brand">
          ← Back to list
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-ink-900">{order.po_number ?? order.pr_number}</h1>
          <StatusPill status={order.status} />
        </div>
        <p className="text-sm text-ink-400">{order.purpose}</p>
      </div>

      <div className="no-print flex gap-2">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              tab === tb ? 'bg-brand text-white' : 'border border-ink-100 bg-white text-ink-400',
            )}
          >
            {tb}
          </button>
        ))}
      </div>

      {tab === 'Summary' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card title="Progress">
              <ol className="flex flex-wrap gap-x-1 gap-y-3">
                {ORDER_FLOW.map((s, i) => (
                  <li key={s} className="flex items-center gap-1">
                    <span
                      className={cx(
                        'h-2 w-2 rounded-full',
                        i < step ? 'bg-brand' : i === step ? 'bg-accent ring-4 ring-accent/20' : 'bg-ink-200',
                      )}
                    />
                    <span className={cx('text-[10px] font-semibold', i <= step ? 'text-ink-600' : 'text-ink-200')}>
                      {s.replace(/_/g, ' ')}
                    </span>
                    {i < ORDER_FLOW.length - 1 && <span className="mx-1 h-px w-3 bg-ink-100" />}
                  </li>
                ))}
              </ol>
              {order.rejection_reason && (
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  Returned: {order.rejection_reason}
                </p>
              )}
            </Card>

            <Card title="Items" subtitle={`${lines?.length ?? 0} line items`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-[11px] uppercase text-ink-400">
                      <th className="py-2">Item</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Unit price</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lines ?? []).map((l) => (
                      <tr key={l.id} className="border-b border-ink-100">
                        <td className="py-2">
                          <span className="font-semibold text-ink-900">{l.name}</span>
                          <span className="block text-[11px] text-ink-400">{l.description}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {l.qty} {l.unit}
                        </td>
                        <td className="py-2 text-right tabular-nums">{peso(l.unit_price)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{peso(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Audit trail">
              <ol className="space-y-3">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink-200" />
                    <div>
                      <p className="text-sm text-ink-900">{e.note}</p>
                      <p className="text-[11px] text-ink-400">
                        {e.actor_name} · {formatDateTime(e.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Financial summary" subtitle="Government purchase, VAT-registered supplier">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-400">Gross (VAT incl.)</dt>
                  <dd className="font-semibold tabular-nums">{peso(t.gross)}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-ink-400">Net of VAT</dt>
                  <dd className="tabular-nums text-ink-400">{peso(t.netOfVat)}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-ink-400">VAT ({(tax.vat_rate * 100).toFixed(0)}%)</dt>
                  <dd className="tabular-nums text-ink-400">{peso(t.vat)}</dd>
                </div>
                <div className="mt-2 flex justify-between border-t border-ink-100 pt-2">
                  <dt className="text-ink-400">
                    EWT {(tax.ewt_rate * 100).toFixed(0)}% ({tax.ewt_atc})
                  </dt>
                  <dd className="tabular-nums text-red-600">−{peso(t.ewt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-400">
                    Final VAT {(tax.final_vat_withheld_rate * 100).toFixed(0)}% ({tax.vat_atc})
                  </dt>
                  <dd className="tabular-nums text-red-600">−{peso(t.vatWithheld)}</dd>
                </div>
                <div className="mt-2 flex justify-between border-t-2 border-ink-900 pt-2">
                  <dt className="font-bold text-ink-900">Net payable</dt>
                  <dd className="text-base font-black tabular-nums text-ink-900">{peso(t.netPayable)}</dd>
                </div>
              </dl>
            </Card>

            <Card title="Parties">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-ink-400">School</p>
                  <p className="font-semibold text-ink-900">{school.name}</p>
                  <p className="text-xs text-ink-400">TIN {school.tin}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-ink-400">Supplier</p>
                  <p className="font-semibold text-ink-900">{supplier?.name ?? 'Not yet assigned'}</p>
                  {supplier && <p className="text-xs text-ink-400">TIN {supplier.tin}</p>}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-ink-400">Dates</p>
                  <p className="text-xs text-ink-400">Requested {formatDate(order.created_at)}</p>
                  <p className="text-xs text-ink-400">Delivered {formatDate(order.delivered_at)}</p>
                  <p className="text-xs text-ink-400">Paid {formatDate(order.paid_at)}</p>
                </div>
              </div>
            </Card>

            <Card title="Actions" subtitle="Only steps your role can take appear here">
              <OrderActions order={order} />
              {order.status === 'archived' && <p className="text-xs text-ink-400">This transaction is closed.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'Documents' && (
        <div className="space-y-4">
          <div className="no-print flex flex-wrap items-center gap-2">
            {docs.map((d) => (
              <button
                key={d}
                onClick={() => setDoc(d)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-bold',
                  doc === d ? 'bg-ink-900 text-white' : 'border border-ink-200 bg-white text-ink-400',
                )}
              >
                {DOC_TITLE[d]}
              </button>
            ))}
            <div className="flex-1" />
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
          </div>
          <PrintDoc
            type={docs.includes(doc) ? doc : 'PR'}
            order={order}
            lines={lines ?? []}
            school={school}
            supplier={supplier ?? null}
            tax={tax}
            template={template}
            logo={logo}
            checkPhoto={checkPhoto}
          />
        </div>
      )}

      {tab === 'Thread' && (
        <Card title="Order thread" subtitle="School, supplier and system events in one conversation">
          <OrderChat orderId={order.id} />
        </Card>
      )}
    </div>
  )
}
