import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { peso } from '../../lib/money'
import { formatDate } from '../../lib/ids'
import { Badge, Card, Empty, Stat, StatusPill } from '../../components/ui'

export function OwnerDashboard() {
  const schools = useLiveQuery(() => db.schools.toArray(), [], [])
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], [])
  const orders = useLiveQuery(() => db.orders.reverse().sortBy('created_at'), [], [])
  const payments = useLiveQuery(() => db.subscription_payments.toArray(), [], [])

  const pending = (payments ?? []).filter((p) => p.status === 'pending')
  const gmv = (orders ?? []).filter((o) => o.paid_at).reduce((s, o) => s + o.gross_total, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">Platform overview</h1>
        <p className="text-sm text-ink-400">Every tenant on this deployment.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Schools" value={(schools ?? []).length} />
        <Stat label="Suppliers" value={(suppliers ?? []).length} />
        <Stat label="Payments to review" value={pending.length} tone={pending.length ? 'accent' : undefined} />
        <Stat label="Transacted volume" value={peso(gmv)} />
      </div>

      <Card
        title="Subscription payments awaiting review"
        action={<Link to="/owner/payments" className="text-xs font-semibold text-brand">Review queue</Link>}
      >
        {pending.length === 0 ? (
          <Empty title="Queue is clear" hint="Supplier payment proofs appear here for approval." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {pending.map((p) => {
              const s = (suppliers ?? []).find((x) => x.id === p.supplier_id)
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{s?.name ?? p.supplier_id}</p>
                    <p className="text-xs text-ink-400">
                      {peso(p.amount)} · {p.period_covered} · {formatDate(p.created_at)}
                    </p>
                  </div>
                  <Badge tone="warn">pending</Badge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Recent transactions across all tenants">
        {(orders ?? []).length === 0 ? (
          <Empty title="No activity yet" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(orders ?? []).slice(0, 8).map((o) => {
              const school = (schools ?? []).find((s) => s.id === o.school_id)
              return (
                <li key={o.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{o.po_number ?? o.pr_number}</p>
                    <p className="truncate text-xs text-ink-400">
                      {school?.name} · {formatDate(o.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{peso(o.gross_total)}</p>
                    <StatusPill status={o.status} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
