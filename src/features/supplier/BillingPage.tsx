import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { peso } from '../../lib/money'
import { formatDate, nowIso, uuid } from '../../lib/ids'
import { put } from '../../lib/db/repo'
import { can } from '../../lib/permissions'
import { Badge, Button, Card, Empty, Field, Input, Modal, cx } from '../../components/ui'
import { PhotoCapture } from '../../components/PhotoCapture'
import { PAYMENT_KIND_LABEL, type Attachment, type PaymentMethod, type SubscriptionPayment } from '../../types'

const MONTHLY_FEE = 1500

export function BillingPage() {
  const profile = useAuth((s) => s.profile)!
  const [open, setOpen] = useState(false)
  const [methodId, setMethodId] = useState('')
  const [reference, setReference] = useState('')
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [amount, setAmount] = useState(MONTHLY_FEE)
  const [proof, setProof] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)

  const supplier = useLiveQuery(() => db.suppliers.get(profile.supplier_id!), [profile.supplier_id])
  const payments = useLiveQuery(
    () => db.subscription_payments.where('supplier_id').equals(profile.supplier_id!).reverse().sortBy('created_at'),
    [profile.supplier_id],
    [],
  )
  const attachments = useLiveQuery(() => db.attachments.toArray(), [], [])
  const methods = useLiveQuery(
    async () => (await db.payment_methods.toArray()).filter((m) => m.active).sort((a, b) => a.sort_order - b.sort_order),
    [],
    [] as PaymentMethod[],
  )

  useEffect(() => {
    if (!methodId && (methods ?? []).length) setMethodId(methods![0].id)
  }, [methods, methodId])

  const selected = (methods ?? []).find((m) => m.id === methodId) ?? null

  const submit = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const row: SubscriptionPayment = {
        id: uuid(),
        client_uuid: uuid(),
        supplier_id: profile.supplier_id!,
        amount,
        payment_method_id: selected.id,
        /* Snapshot the name — the owner may rename or delete the method later. */
        method_label: selected.label || PAYMENT_KIND_LABEL[selected.kind],
        reference: reference.trim(),
        period_covered: period,
        proof_attachment_id: proof?.id ?? null,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: nowIso(),
      }
      await put('subscription_payments', row, 'insert')
      setOpen(false)
      setReference('')
      setProof(null)
    } finally {
      setBusy(false)
    }
  }

  const paidUntil = supplier?.subscription_paid_until
  const canPay = can(profile.role, 'subscription.pay')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink-900">Subscription</h1>
          <p className="text-sm text-ink-400">
            {peso(MONTHLY_FEE)} per month · paid until {paidUntil ? formatDate(paidUntil) : 'not yet paid'}
          </p>
        </div>
        {canPay && (
          <Button onClick={() => setOpen(true)} disabled={(methods ?? []).length === 0}>
            Submit payment
          </Button>
        )}
      </div>

      <Card title="Where to pay" subtitle="Accounts published by GridSupply">
        {(methods ?? []).length === 0 ? (
          <Empty
            title="No payment method available yet"
            hint="GridSupply has not published an account to pay into. Please check back shortly."
          />
        ) : (
          <ul className="space-y-3">
            {(methods ?? []).map((m) => {
              const qr = (attachments ?? []).find((a) => a.id === m.qr_attachment_id)
              return (
                <li key={m.id} className="glass-quiet rounded-2xl p-4">
                  <div className="flex gap-4">
                    {qr && (
                      <img
                        src={qr.data_url}
                        alt={`${m.label} QR code`}
                        className="h-28 w-28 shrink-0 rounded-lg border border-ink-100 bg-white object-contain"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                        {m.label || PAYMENT_KIND_LABEL[m.kind]}
                        <Badge>{PAYMENT_KIND_LABEL[m.kind]}</Badge>
                      </p>
                      <dl className="mt-1.5 space-y-0.5 text-xs">
                        {m.bank_name && (
                          <div className="flex gap-2">
                            <dt className="w-24 shrink-0 text-ink-400">Bank</dt>
                            <dd className="text-ink-900">{m.bank_name}</dd>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-ink-400">Account name</dt>
                          <dd className="text-ink-900">{m.account_name || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-ink-400">
                            {m.kind === 'bank_transfer' ? 'Account no.' : 'Number'}
                          </dt>
                          <dd className="font-bold tabular-nums text-ink-900">{m.account_number}</dd>
                        </div>
                      </dl>
                      {m.instructions && <p className="mt-2 text-xs text-ink-400">{m.instructions}</p>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <ol className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm text-ink-600">
          <li>1. Send {peso(MONTHLY_FEE)} to one of the accounts above.</li>
          <li>2. Photograph the receipt and submit it here with the reference number.</li>
          <li>3. GridSupply reviews it — your account stays active while a payment is pending.</li>
        </ol>
      </Card>

      <Card title="Payment history">
        {(payments ?? []).length === 0 ? (
          <Empty title="No payments submitted" hint="Submit your first proof of payment to start your subscription." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(payments ?? []).map((p) => {
              const proofFile = (attachments ?? []).find((a) => a.id === p.proof_attachment_id)
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  {proofFile && (
                    <img src={proofFile.data_url} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-ink-100 object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-900">{peso(p.amount)}</p>
                    <p className="truncate text-xs text-ink-400">
                      {p.period_covered} · {p.method_label} · Ref {p.reference || '—'}
                    </p>
                    {p.review_note && <p className="text-xs text-ink-400">Note: {p.review_note}</p>}
                  </div>
                  <Badge tone={p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'}>{p.status}</Badge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Submit proof of payment">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} />
            </Field>
            <Field label="Period covered">
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Paid via</p>
            <div className="space-y-2">
              {(methods ?? []).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethodId(m.id)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                    methodId === m.id
                      ? 'border-brand/50 bg-[rgba(180,89,58,0.12)]'
                      : 'border-[rgba(120,80,50,0.18)] hover:bg-[rgba(255,251,245,0.7)]',
                  )}
                >
                  <span
                    className={cx(
                      'h-4 w-4 shrink-0 rounded-full border-2',
                      methodId === m.id ? 'border-brand bg-brand' : 'border-ink-200',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {m.label || PAYMENT_KIND_LABEL[m.kind]}
                    </span>
                    <span className="block truncate text-[11px] text-ink-400">{m.account_number}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Reference number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="0091234567" />
          </Field>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Screenshot / receipt</p>
            <PhotoCapture kind="payment_proof" value={proof} onChange={setProof} label="Capture receipt" />
          </div>
          <Button full disabled={busy || !reference.trim() || amount <= 0 || !selected} onClick={submit}>
            Submit for review
          </Button>
        </div>
      </Modal>
    </div>
  )
}
