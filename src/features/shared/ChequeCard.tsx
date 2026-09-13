import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { can } from '../../lib/permissions'
import { downloadAttachment } from '../../lib/download'
import { attachChequePhoto } from '../../lib/orders'
import { fileToAttachment } from '../../lib/attachments'
import { formatDate } from '../../lib/ids'
import { peso, computeTax } from '../../lib/money'
import { Button, Card, Modal } from '../../components/ui'
import type { Order, TaxConfig } from '../../types'

/**
 * Cheque record for a paid order.
 *
 * Government disbursement is by cheque — there is no other payment path in the
 * workflow. The school captures the image; both the school and the supplier can
 * download it, because the supplier needs the cheque alongside the DV and BIR
 * 2307 for their own books.
 */
export function ChequeCard({ order, tax }: { order: Order; tax: TaxConfig }) {
  const profile = useAuth((s) => s.profile)!
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)

  const photo = useLiveQuery(
    async () => (order.check_photo_id ? db.attachments.get(order.check_photo_id) : undefined),
    [order.check_photo_id],
  )

  if (!order.paid_at && !order.check_number) return null

  const canCapture = can(profile.role, 'check.capture')
  const net = computeTax(order.gross_total, tax, order.supplier_vat_registered).netPayable
  const baseName = `cheque-${order.check_number || 'unnumbered'}-${order.po_number ?? order.pr_number}`

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const attachment = await fileToAttachment(file, 'check_photo')
      await attachChequePhoto(order.id, profile, attachment.id, !!order.check_photo_id)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <Card title="Cheque" subtitle="Government disbursement — cheque is the only payment method">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-400">Cheque no.</dt>
          <dd className="font-bold tabular-nums text-ink-900">{order.check_number || '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-400">Date released</dt>
          <dd className="text-ink-900">{formatDate(order.paid_at)}</dd>
        </div>
        <div className="flex justify-between border-t border-[rgba(120,80,50,0.12)] pt-1.5">
          <dt className="text-ink-400">Amount</dt>
          <dd className="font-black tabular-nums text-ink-900">{peso(net)}</dd>
        </div>
      </dl>

      {photo ? (
        <div className="mt-4 space-y-3">
          <button
            onClick={() => setPreview(true)}
            className="block w-full overflow-hidden rounded-xl border border-[rgba(120,80,50,0.18)]"
            aria-label="View cheque photo full size"
          >
            <img src={photo.data_url} alt="Cheque" className="max-h-56 w-full bg-[rgba(255,251,245,0.6)] object-contain" />
          </button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadAttachment(photo, baseName)}>
              Download cheque
            </Button>
            {canCapture && (
              <label className="inline-flex">
                <span
                  className={`inline-flex cursor-pointer items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-[rgba(255,251,245,0.6)] ${busy ? 'pointer-events-none opacity-40' : ''}`}
                >
                  {busy ? 'Saving…' : 'Replace photo'}
                </span>
                <input type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" />
              </label>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {canCapture ? (
            <>
              <p className="mb-2 text-xs text-ink-400">
                No cheque photo on file. Capture one so the supplier can download it with the voucher.
              </p>
              <label className="inline-flex">
                <span
                  className={`inline-flex cursor-pointer items-center rounded-xl bg-gradient-to-b from-[#c2643f] to-[#a24e33] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(140,66,38,0.75)] ${busy ? 'pointer-events-none opacity-40' : ''}`}
                >
                  {busy ? 'Saving…' : 'Upload cheque photo'}
                </span>
                <input type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" />
              </label>
            </>
          ) : (
            <p className="text-xs text-ink-400">
              The school has not uploaded a cheque photo yet. It will appear here once they do.
            </p>
          )}
        </div>
      )}

      <Modal open={preview} onClose={() => setPreview(false)} title={`Cheque ${order.check_number || ''}`} wide>
        {photo && (
          <div className="space-y-3">
            <img src={photo.data_url} alt="Cheque" className="w-full rounded-xl bg-[rgba(255,251,245,0.6)] object-contain" />
            <Button full onClick={() => downloadAttachment(photo, baseName)}>
              Download cheque
            </Button>
          </div>
        )}
      </Modal>
    </Card>
  )
}
