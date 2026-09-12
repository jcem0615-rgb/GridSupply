import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { put, remove } from '../../lib/db/repo'
import { nowIso, uuid } from '../../lib/ids'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Textarea, cx } from '../../components/ui'
import { PhotoCapture } from '../../components/PhotoCapture'
import { PAYMENT_KIND_LABEL, type PaymentMethod, type PaymentMethodKind } from '../../types'

const KINDS: PaymentMethodKind[] = ['gcash', 'maya', 'bank_transfer', 'other']

const blank = (sortOrder: number): PaymentMethod => ({
  id: uuid(),
  label: '',
  kind: 'gcash',
  account_name: '',
  account_number: '',
  bank_name: '',
  instructions: '',
  qr_attachment_id: null,
  active: true,
  sort_order: sortOrder,
  created_at: nowIso(),
  updated_at: nowIso(),
})

/**
 * Suppliers pay the platform subscription into whatever the owner publishes
 * here — nothing about the destination account is baked into the build.
 */
export function PaymentMethodsPanel() {
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PaymentMethod | null>(null)
  const [busy, setBusy] = useState(false)

  const methods = useLiveQuery(async () => (await db.payment_methods.toArray()).sort((a, b) => a.sort_order - b.sort_order), [], [])
  const attachments = useLiveQuery(() => db.attachments.toArray(), [], [])
  const payments = useLiveQuery(() => db.subscription_payments.toArray(), [], [])

  const isNew = !!editing && !(methods ?? []).some((m) => m.id === editing.id)

  const save = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await put('payment_methods', { ...editing, updated_at: nowIso() }, isNew ? 'insert' : 'update')
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await remove('payment_methods', confirmDelete.id)
      setConfirmDelete(null)
    } finally {
      setBusy(false)
    }
  }

  /* Past submissions keep a label snapshot, so deleting a method never orphans history. */
  const usageCount = (id: string) => (payments ?? []).filter((p) => p.payment_method_id === id).length

  return (
    <div className="space-y-4">
      <Card
        title="Where suppliers send payment"
        subtitle="Active methods appear on every supplier's billing page"
        action={<Button onClick={() => setEditing(blank(((methods ?? []).at(-1)?.sort_order ?? 0) + 1))}>Add method</Button>}
      >
        {(methods ?? []).length === 0 ? (
          <Empty
            title="No payment methods"
            hint="Add at least one — suppliers cannot submit a subscription payment until there is somewhere to send it."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(methods ?? []).map((m) => {
              const qr = (attachments ?? []).find((a) => a.id === m.qr_attachment_id)
              return (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  {qr ? (
                    <img src={qr.data_url} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-ink-100 object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-[10px] font-bold text-ink-400">
                      {PAYMENT_KIND_LABEL[m.kind].slice(0, 4)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-bold text-ink-900">
                      {m.label || PAYMENT_KIND_LABEL[m.kind]}
                      {!m.active && <Badge tone="warn">hidden</Badge>}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {PAYMENT_KIND_LABEL[m.kind]} · {m.account_number || 'no account number'}
                      {m.account_name ? ` · ${m.account_name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="secondary" onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(m)}>
                      Delete
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={isNew ? 'Add payment method' : 'Edit payment method'}>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select
                  value={editing.kind}
                  onChange={(e) => setEditing({ ...editing, kind: e.target.value as PaymentMethodKind })}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {PAYMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Display name">
                <Input
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="GCash — main"
                />
              </Field>
            </div>
            <Field label="Account name">
              <Input
                value={editing.account_name}
                onChange={(e) => setEditing({ ...editing, account_name: e.target.value })}
                placeholder="GridSupply Technologies"
              />
            </Field>
            <Field label={editing.kind === 'bank_transfer' ? 'Account number' : 'Mobile number'}>
              <Input
                value={editing.account_number}
                onChange={(e) => setEditing({ ...editing, account_number: e.target.value })}
                placeholder={editing.kind === 'bank_transfer' ? '1234-5678-90' : '0917 555 0142'}
              />
            </Field>
            {editing.kind === 'bank_transfer' && (
              <Field label="Bank">
                <Input
                  value={editing.bank_name}
                  onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })}
                  placeholder="Bank of the Philippine Islands"
                />
              </Field>
            )}
            <Field label="Instructions" hint="Shown to the supplier under the account details.">
              <Textarea
                value={editing.instructions}
                onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                className="min-h-16"
                placeholder="Use your supplier name as the remark so we can match the payment."
              />
            </Field>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">QR code (optional)</p>
              <PhotoCapture
                kind="payment_proof"
                value={(attachments ?? []).find((a) => a.id === editing.qr_attachment_id) ?? null}
                onChange={(a) => setEditing({ ...editing, qr_attachment_id: a?.id ?? null })}
                label="Upload QR"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                className="h-4 w-4 accent-[#b4593a]"
              />
              Visible to suppliers
            </label>
            <Button full onClick={save} disabled={busy || !editing.account_number.trim()}>
              {busy ? 'Saving…' : 'Save method'}
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete payment method">
        {confirmDelete && (
          <>
            <p className="text-sm text-ink-600">
              Remove <span className="font-bold">{confirmDelete.label || PAYMENT_KIND_LABEL[confirmDelete.kind]}</span>?
              Suppliers will no longer be able to select it.
            </p>
            {usageCount(confirmDelete.id) > 0 && (
              <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
                {usageCount(confirmDelete.id)} past payment{usageCount(confirmDelete.id) === 1 ? '' : 's'} used this
                method. Those records keep the name they were submitted under, so history stays readable.
              </p>
            )}
            <p className="mt-3 text-xs text-ink-400">
              To stop offering it without deleting anything, edit it and untick “Visible to suppliers”.
            </p>
            <div className={cx('mt-4 flex gap-2')}>
              <Button variant="secondary" full onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" full onClick={doDelete} disabled={busy}>
                Delete
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
