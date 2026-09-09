import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { computeTax, peso } from '../../lib/money'
import { getTaxConfig } from '../../lib/db/seed'
import { formatDate } from '../../lib/ids'
import { Card, Empty, Stat, StatusPill } from '../../components/ui'

export function SupplierDashboard() {
  const profile = useAuth((s) => s.profile)!

  const orders = useLiveQuery(async () => {
    const rows = await db.orders.where('supplier_id').equals(profile.supplier_id!).reverse().sortBy('created_at')
    return rows.filter((o) => !['draft', 'pr_submitted', 'pr_approved', 'pr_rejected'].includes(o.status))
  }, [profile.supplier_id], [])
  const supplier = useLiveQuery(() => db.suppliers.get(profile.supplier_id!), [profile.supplier_id])
  const tax = useLiveQuery(() => getTaxConfig(), [])

  const list = orders ?? []
  const toAccept = list.filter((o) => o.status === 'po_issued')
  const inFlight = list.filter((o) => ['po_accepted', 'dispatched', 'delivered', 'dv_issued'].includes(o.status))
  const receivable = tax
    ? inFlight.reduce((s, o) => s + computeTax(o.gross_total, tax).netPayable, 0)
    : 0
  const paidYtd = tax
    ? list
        .filter((o) => o.paid_at && new Date(o.paid_at).getFullYear() === new Date().getFullYear())
        .reduce((s, o) => s + computeTax(o.gross_total, tax).netPayable, 0)
    : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">{supplier?.name}</h1>
        <p className="text-sm text-ink-400">
          {profile.full_name} · {profile.position_title}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To accept" value={toAccept.length} tone={toAccept.length ? 'accent' : undefined} />
        <Stat label="In progress" value={inFlight.length} />
        <Stat label="Receivable (net)" value={peso(receivable)} />
        <Stat label="Collected YTD" value={peso(paidYtd)} />
      </div>

      <Card title="New purchase orders" subtitle="Waiting for you to accept" action={<Link to="/supplier/orders" className="text-xs font-semibold text-brand">All orders</Link>}>
        {toAccept.length === 0 ? (
          <Empty title="No new orders" hint="Purchase orders land here the moment a school's BAC issues one." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {toAccept.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{o.po_number}</p>
                    <p className="truncate text-xs text-ink-400">{formatDate(o.po_issued_at)} · {o.purpose}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{peso(o.gross_total)}</p>
                    <StatusPill status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="In progress">
        {inFlight.length === 0 ? (
          <Empty title="Nothing in transit" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {inFlight.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{o.po_number}</p>
                    <p className="truncate text-xs text-ink-400">{o.purpose}</p>
                  </div>
                  <StatusPill status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
