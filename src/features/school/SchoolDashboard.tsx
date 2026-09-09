import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { peso } from '../../lib/money'
import { formatDate } from '../../lib/ids'
import { Card, Empty, Stat, StatusPill, Button } from '../../components/ui'
import { can } from '../../lib/permissions'
import type { OrderStatus } from '../../types'

const HONORIFICS = new Set(['dr.', 'dr', 'mr.', 'mrs.', 'ms.', 'engr.', 'atty.'])

/** "Dr. Elena Villanueva" -> "Elena", not "Dr.". */
function greetingName(fullName: string) {
  const parts = fullName.split(' ').filter(Boolean)
  const first = parts.find((p) => !HONORIFICS.has(p.toLowerCase()))
  return first ?? fullName
}

/**
 * Statuses waiting on the school. The school side is one Principal account,
 * so every step that is not the supplier's move belongs in this queue.
 */
const SCHOOL_INBOX: OrderStatus[] = [
  'draft',
  'pr_submitted',
  'pr_approved',
  'dispatched',
  'delivered',
  'dv_issued',
]

export function SchoolDashboard() {
  const profile = useAuth((s) => s.profile)!
  const orders = useLiveQuery(
    () => db.orders.where('school_id').equals(profile.school_id!).reverse().sortBy('created_at'),
    [profile.school_id],
    [],
  )

  const waiting = (orders ?? []).filter((o) => SCHOOL_INBOX.includes(o.status))
  const active = (orders ?? []).filter((o) => !['archived', 'paid', 'pr_rejected', 'po_declined'].includes(o.status))
  const committed = active.reduce((s, o) => s + o.gross_total, 0)
  const paidThisYear = (orders ?? [])
    .filter((o) => o.paid_at && new Date(o.paid_at).getFullYear() === new Date().getFullYear())
    .reduce((s, o) => s + o.gross_total, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">Good day, {greetingName(profile.full_name)}.</h1>
        <p className="text-sm text-ink-400">{profile.position_title}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Needs you" value={waiting.length} tone={waiting.length ? 'accent' : undefined} />
        <Stat label="Active" value={active.length} />
        <Stat label="Committed" value={peso(committed)} />
        <Stat label="Paid YTD" value={peso(paidThisYear)} />
      </div>

      <Card
        title="Your action queue"
        subtitle="Requests currently waiting on your role"
        action={
          can(profile.role, 'pr.create') ? (
            <Link to="/school/new">
              <Button>New PR</Button>
            </Link>
          ) : undefined
        }
      >
        {waiting.length === 0 ? (
          <Empty title="Nothing waiting on you" hint="Requests appear here the moment they reach your step of the workflow." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {waiting.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-3 transition hover:bg-ink-50/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{o.pr_number}</p>
                    <p className="truncate text-xs text-ink-400">{o.purpose}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-ink-900">{peso(o.gross_total)}</p>
                    <StatusPill status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent activity" subtitle="Latest requests from this school" action={<Link to="/school/orders" className="text-xs font-semibold text-brand">View all</Link>}>
        {(orders ?? []).length === 0 ? (
          <Empty
            title="No purchase requests yet"
            hint="Start with a Purchase Request — the Principal approves it, then the BAC issues a PO to your supplier."
            action={
              can(profile.role, 'pr.create') ? (
                <Link to="/school/new">
                  <Button>Create the first PR</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(orders ?? []).slice(0, 6).map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{o.po_number ?? o.pr_number}</p>
                    <p className="truncate text-xs text-ink-400">
                      {formatDate(o.created_at)} · {o.purpose}
                    </p>
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
