import { useState } from 'react'
import { Link } from 'react-router-dom'
import { peso } from '../../lib/money'
import { formatDate } from '../../lib/ids'
import { Card, Empty, StatusPill, cx } from '../../components/ui'
import type { Order, OrderStatus } from '../../types'

const GROUPS: { key: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'open', label: 'Open', match: (s) => !['paid', 'archived', 'pr_rejected', 'po_declined'].includes(s) },
  { key: 'awaiting', label: 'Awaiting action', match: (s) => ['pr_submitted', 'pr_approved', 'po_issued', 'dispatched', 'delivered'].includes(s) },
  { key: 'closed', label: 'Closed', match: (s) => ['paid', 'archived'].includes(s) },
]

export function OrderList({
  orders,
  title,
  emptyHint,
}: {
  orders: Order[]
  title: string
  emptyHint: string
}) {
  const [group, setGroup] = useState('open')
  const [q, setQ] = useState('')

  const active = GROUPS.find((g) => g.key === group)!
  const rows = orders.filter(
    (o) =>
      active.match(o.status) &&
      (q === '' ||
        `${o.pr_number} ${o.po_number ?? ''} ${o.dv_number ?? ''} ${o.purpose}`.toLowerCase().includes(q.toLowerCase())),
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black tracking-tight text-ink-900">{title}</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              group === g.key ? 'bg-brand text-white' : 'bg-white text-ink-400 border border-ink-100',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by PR / PO / DV number or purpose"
        className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand"
      />

      {rows.length === 0 ? (
        <Empty title="Nothing here" hint={emptyHint} />
      ) : (
        <Card className="overflow-hidden" >
          <ul className="divide-y divide-ink-100">
            {rows.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-3 transition hover:bg-ink-50/60">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      {o.po_number ?? o.pr_number}
                      {o.dv_number && <span className="text-[11px] font-semibold text-ink-400">{o.dv_number}</span>}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {formatDate(o.created_at)} · {o.purpose}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-ink-900">{peso(o.gross_total)}</p>
                    <StatusPill status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-[11px] text-ink-400">
        Showing {rows.length} of {orders.length}
      </p>
    </div>
  )
}
