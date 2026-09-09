import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { peso } from '../../lib/money'
import { formatDate, nowIso, uuid } from '../../lib/ids'
import { put } from '../../lib/db/repo'
import { can } from '../../lib/permissions'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select } from '../../components/ui'
import { PhotoCapture } from '../../components/PhotoCapture'
import type { Attachment, SubscriptionPayment } from '../../types'

const MONTHLY_FEE = 1500

export function BillingPage() {
  const profile = useAuth((s) => s.profile)!
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<'gcash' | 'bank_transfer'>('gcash')
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

  const submit = async () => {
    setBusy(true)
    try {
      const row: SubscriptionPayment = {
        id: uuid(),
        client_uuid: uuid(),
        supplier_id: profile.supplier_id!,
        amount,
        method,
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink-900">Subscription</h1>
          <p className="text-sm text-ink-400">
            {peso(MONTHLY_FEE)} per month · paid until {paidUntil ? formatDate(paidUntil) : 'not yet paid'}
          </p>
        </div>
        {can(profile.role, 'subscription.pay') && <Button onClick={() => setOpen(true)}>Submit payment</Button>}
      </div>

      <Card title="How payment works">
        <ol className="space-y-2 text-sm text-ink-600">
          <li>1. Send {peso(MONTHLY_FEE)} via GCash or bank transfer to the platform account.</li>
          <li>2. Photograph the receipt and submit it here with the reference number.</li>
          <li>3. The platform owner reviews it — your account stays active while a payment is pending.</li>
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
                      {p.period_covered} · {p.method === 'gcash' ? 'GCash' : 'Bank transfer'} · Ref {p.reference || '—'}
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
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as 'gcash' | 'bank_transfer')}>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank transfer</option>
            </Select>
          </Field>
          <Field label="Reference number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="0091234567" />
          </Field>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Screenshot / receipt</p>
            <PhotoCapture kind="payment_proof" value={proof} onChange={setProof} label="Capture receipt" />
          </div>
          <Button full disabled={busy || !reference.trim() || amount <= 0} onClick={submit}>
            Submit for review
          </Button>
        </div>
      </Modal>
    </div>
  )
}
