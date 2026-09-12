import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../store/auth'
import { loadClients, type ClientSummary } from '../../lib/clients'
import { peso } from '../../lib/money'
import { formatDate } from '../../lib/ids'
import { Card, Empty, Input, Stat, cx } from '../../components/ui'
import { Pager } from '../../components/Pager'
import { usePaged } from '../../lib/usePaged'

export function ClientsPage() {
  const profile = useAuth((s) => s.profile)!
  const [q, setQ] = useState('')

  const clients = useLiveQuery(
    () => loadClients(profile.supplier_id!),
    [profile.supplier_id],
    [] as ClientSummary[],
  )

  const all = clients ?? []
  const term = q.trim().toLowerCase()
  const rows = all.filter(
    (c) =>
      term === '' ||
      c.school.name.toLowerCase().includes(term) ||
      c.school.division.toLowerCase().includes(term) ||
      (c.record?.contact_name ?? '').toLowerCase().includes(term),
  )
  const paged = usePaged(rows, 10, term)

  const transacted = all.reduce((s, c) => s + c.transacted, 0)
  const open = all.reduce((s, c) => s + c.open, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">Clients</h1>
        <p className="text-sm text-ink-400">Schools that have issued you a purchase order.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Clients" value={all.length} />
        <Stat label="Collected" value={peso(transacted)} />
        <Stat label="In progress" value={peso(open)} tone={open > 0 ? 'accent' : undefined} />
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by school, division or contact…" />

      {rows.length === 0 ? (
        <Empty
          title={term ? 'No matching clients' : 'No clients yet'}
          hint={
            term
              ? 'Try a different search term.'
              : 'A school becomes a client the moment it issues you a purchase order.'
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[rgba(120,80,50,0.1)]">
            {paged.rows.map((c) => (
              <li key={c.school.id}>
                <Link
                  to={`/supplier/clients/${c.school.id}`}
                  className="flex items-center gap-3 py-3 transition hover:bg-[rgba(255,251,245,0.5)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[rgba(224,162,51,0.3)] to-[rgba(180,89,58,0.3)] text-xs font-bold text-ink-700 ring-1 ring-white/50">
                    {c.school.name
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{c.school.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      {c.record?.contact_name ? `${c.record.contact_name} · ` : ''}
                      {c.school.division || 'No division on file'}
                    </p>
                    <p className="truncate text-[11px] text-ink-400">
                      {c.orderCount} order{c.orderCount === 1 ? '' : 's'} · last {formatDate(c.lastOrderAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-ink-900">{peso(c.transacted)}</p>
                    {c.open > 0 && (
                      <p className={cx('text-[11px] font-semibold text-accent')}>{peso(c.open)} in progress</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager paged={paged} unit="clients" />
        </Card>
      )}
    </div>
  )
}
