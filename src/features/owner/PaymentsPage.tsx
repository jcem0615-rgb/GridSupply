import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { put } from '../../lib/db/repo'
import { peso } from '../../lib/money'
import { formatDate, nowIso } from '../../lib/ids'
import { Badge, Button, Card, Empty, Field, Modal, Textarea, cx } from '../../components/ui'
import { PaymentMethodsPanel } from './PaymentMethodsPanel'
import type { PaymentStatus, SubscriptionPayment } from '../../types'

/** Approving a month of subscription extends the supplier's paid-until date. */
function extend(paidUntil: string | null, period: string) {
  const [y, m] = period.split('-').map(Number)
  const end = new Date(y, m, 0).toISOString()
  if (!paidUntil) return end
  return new Date(paidUntil) > new Date(end) ? paidUntil : end
}

export function PaymentsPage() {
  const profile = useAuth((s) => s.profile)!
  const [tab, setTab] = useState<'queue' | 'methods'>('queue')
  const [filter, setFilter] = useState<PaymentStatus>('pending')
  const [active, setActive] = useState<SubscriptionPayment | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const payments = useLiveQuery(() => db.subscription_payments.reverse().sortBy('created_at'), [], [])
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], [])
  const attachments = useLiveQuery(() => db.attachments.toArray(), [], [])

  const rows = (payments ?? []).filter((p) => p.status === filter)

  const decide = async (status: 'approved' | 'rejected') => {
    if (!active) return
    setBusy(true)
    try {
      await put(
        'subscription_payments',
        {
          ...active,
          status,
          reviewed_by: profile.id,
          reviewed_at: nowIso(),
          review_note: note.trim() || null,
        },
        'update',
      )
      if (status === 'approved') {
        const supplier = await db.suppliers.get(active.supplier_id)
        if (supplier) {
          await put(
            'suppliers',
            {
              ...supplier,
              subscription_paid_until: extend(supplier.subscription_paid_until, active.period_covered),
              status: supplier.status === 'stopped' ? 'active' : supplier.status,
            },
            'update',
          )
        }
      }
      setActive(null)
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black tracking-tight text-ink-900">Subscription payments</h1>

      <div className="flex gap-2 border-b border-ink-100 pb-3">
        {([
          ['queue', 'Review queue'],
          ['methods', 'Payment methods'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              tab === k ? 'bg-brand text-white' : 'border border-ink-100 bg-white text-ink-400',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'methods' && <PaymentMethodsPanel />}

      {tab === 'queue' && (
      <>
      <div className="flex gap-2">
        {(['pending', 'approved', 'rejected'] as PaymentStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition',
              filter === s ? 'bg-brand text-white' : 'border border-ink-100 bg-white text-ink-400',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title={`No ${filter} payments`} hint="Suppliers submit GCash or bank transfer proofs from their billing page." />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {rows.map((p) => {
              const supplier = (suppliers ?? []).find((s) => s.id === p.supplier_id)
              const proof = (attachments ?? []).find((a) => a.id === p.proof_attachment_id)
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  {proof ? (
                    <img src={proof.data_url} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-ink-100 object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-[10px] text-ink-400">
                      no proof
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{supplier?.name ?? p.supplier_id}</p>
                    <p className="truncate text-xs text-ink-400">
                      {peso(p.amount)} · {p.period_covered} · {p.method_label} · Ref {p.reference || '—'}
                    </p>
                    <p className="text-[11px] text-ink-400">Submitted {formatDate(p.created_at)}</p>
                  </div>
                  {p.status === 'pending' ? (
                    <Button onClick={() => setActive(p)}>Review</Button>
                  ) : (
                    <Badge tone={p.status === 'approved' ? 'ok' : 'bad'}>{p.status}</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      </>
      )}

      <Modal open={!!active} onClose={() => setActive(null)} title="Review payment" wide>
        {active && (
          <div className="space-y-4">
            {(() => {
              const proof = (attachments ?? []).find((a) => a.id === active.proof_attachment_id)
              return proof ? (
                <img src={proof.data_url} alt="Payment proof" className="max-h-96 w-full rounded-xl border border-ink-100 object-contain" />
              ) : (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  No proof of payment was attached.
                </p>
              )
            })()}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-ink-400">Amount</dt>
                <dd className="font-bold">{peso(active.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-ink-400">Period</dt>
                <dd className="font-bold">{active.period_covered}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-ink-400">Method</dt>
                <dd>{active.method_label}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-ink-400">Reference</dt>
                <dd>{active.reference || '—'}</dd>
              </div>
            </dl>
            <Field label="Note to supplier" hint="Optional — shown on their billing page.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
            </Field>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => decide('rejected')} disabled={busy} full>
                Reject
              </Button>
              <Button onClick={() => decide('approved')} disabled={busy} full>
                Approve & extend
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
