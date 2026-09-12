import { useState } from 'react'
import { Link } from 'react-router-dom'
import { peso } from '../../lib/money'
import { formatDate } from '../../lib/ids'
import { Card, Empty, StatusPill, cx } from '../../components/ui'
import { Pager } from '../../components/Pager'
import { usePaged } from '../../lib/usePaged'
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
  const term = q.trim().toLowerCase()
  const rows = orders.filter(
    (o) =>
      active.match(o.status) &&
      (term === '' ||
        `${o.pr_number} ${o.po_number ?? ''} ${o.dv_number ?? ''} ${o.purpose}`.toLowerCase().includes(term)),
  )
  const paged = usePaged(rows, 15, `${term}|${group}`)

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
              group === g.key
                ? 'bg-gradient-to-b from-[#c2643f] to-[#a24e33] text-white shadow-[0_6px_16px_-8px_rgba(140,66,38,0.8)]'
                : 'glass-quiet text-ink-600',
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
        className="w-full rounded-xl border border-[rgba(120,80,50,0.18)] bg-[rgba(255,252,247,0.78)] px-3.5 py-2.5 text-sm outline-none backdrop-blur-sm transition focus:border-brand/60 focus:bg-[rgba(255,252,247,0.95)]"
      />

      {rows.length === 0 ? (
        <Empty title="Nothing here" hint={emptyHint} />
      ) : (
        <Card className="overflow-hidden" >
          <ul className="divide-y divide-ink-100">
            {paged.rows.map((o) => (
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
          <Pager paged={paged} unit="requests" />
        </Card>
      )}
    </div>
  )
}
