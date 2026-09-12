import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { put } from '../../lib/db/repo'
import { blankClient, loadClient, type ClientSummary } from '../../lib/clients'
import { peso } from '../../lib/money'
import { formatDate, nowIso } from '../../lib/ids'
import { Button, Card, Empty, Field, Input, Stat, StatusPill, Textarea } from '../../components/ui'
import type { SupplierClient } from '../../types'

export function ClientDetailPage() {
  const profile = useAuth((s) => s.profile)!
  const { schoolId = '' } = useParams()
  const [draft, setDraft] = useState<SupplierClient | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const client = useLiveQuery(
    () => loadClient(profile.supplier_id!, schoolId),
    [profile.supplier_id, schoolId],
    undefined as ClientSummary | null | undefined,
  )
  const unreadByOrder = useLiveQuery(() => db.messages.toArray(), [], [])

  useEffect(() => {
    if (client && !draft) setDraft(client.record ?? blankClient(profile.supplier_id!, schoolId))
  }, [client, draft, profile.supplier_id, schoolId])

  if (client === undefined) return <Empty title="Loading…" />
  if (client === null) {
    return (
      <Empty
        title="Not one of your clients"
        hint="Only schools that have issued you a purchase order appear here."
        action={
          <Link to="/supplier/clients">
            <Button variant="secondary">Back to clients</Button>
          </Link>
        }
      />
    )
  }

  const { school, orders } = client

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await put('supplier_clients', { ...draft, updated_at: nowIso() }, client.record ? 'update' : 'insert')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } finally {
      setBusy(false)
    }
  }

  const messageCount = (orderId: string) =>
    (unreadByOrder ?? []).filter((m) => m.order_id === orderId && m.kind === 'user').length

  return (
    <div className="space-y-5">
      <div>
        <Link to="/supplier/clients" className="text-xs font-semibold text-ink-400 hover:text-brand">
          ← Back to clients
        </Link>
        <h1 className="mt-2 text-xl font-black tracking-tight text-ink-900">{school.name}</h1>
        <p className="text-sm text-ink-400">{school.division}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Orders" value={client.orderCount} />
        <Stat label="Collected" value={peso(client.transacted)} />
        <Stat label="In progress" value={peso(client.open)} tone={client.open > 0 ? 'accent' : undefined} />
        <Stat label="Last order" value={formatDate(client.lastOrderAt)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Your notes on this client"
          subtitle="Visible only to your team — the school never sees this"
          action={
            <Button onClick={save} disabled={busy || !draft}>
              {saved ? 'Saved ✓' : busy ? 'Saving…' : 'Save'}
            </Button>
          }
        >
          {draft && (
            <div className="space-y-3">
              <Field label="Contact person">
                <Input
                  value={draft.contact_name}
                  onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })}
                  placeholder="Who you actually deal with"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact number">
                  <Input
                    value={draft.contact_number}
                    onChange={(e) => setDraft({ ...draft, contact_number: e.target.value })}
                    placeholder="0917-555-0142"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={draft.contact_email}
                    onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Delivery notes" hint="Gate to use, receiving hours, who signs.">
                <Textarea
                  value={draft.delivery_notes}
                  onChange={(e) => setDraft({ ...draft, delivery_notes: e.target.value })}
                  className="min-h-16"
                  placeholder="Deliver to the stockroom behind Building B. Receiving until 3pm only."
                />
              </Field>
              <Field label="Internal notes">
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  className="min-h-20"
                  placeholder="Orders bond paper every quarter. Prefers delivery before payday."
                />
              </Field>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="School record" subtitle="Maintained by the school — read-only here">
            <dl className="space-y-2 text-sm">
              {[
                ['School ID', school.school_id_number],
                ['TIN', school.tin],
                ['Division', school.division],
                ['District', school.district],
                ['Address', school.address],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    {label}
                  </dt>
                  <dd className="text-ink-900">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-ink-400">
              These fields print on the PO, DV and BIR 2307, so only the school can change them.
            </p>
          </Card>

          <Card title="Order history" subtitle={`${orders.length} purchase order${orders.length === 1 ? '' : 's'}`}>
            <ul className="divide-y divide-[rgba(120,80,50,0.1)]">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{o.po_number ?? o.pr_number}</p>
                      <p className="truncate text-[11px] text-ink-400">
                        {formatDate(o.created_at)}
                        {messageCount(o.id) > 0 && ` · ${messageCount(o.id)} message${messageCount(o.id) === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums">{peso(o.gross_total)}</p>
                      <StatusPill status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
