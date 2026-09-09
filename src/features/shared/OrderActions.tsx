import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { can, canActNow } from '../../lib/permissions'
import {
  acceptPO,
  approvePR,
  archiveOrder,
  declinePO,
  dispatchOrder,
  issue2307,
  issueDV,
  issuePO,
  receiveDelivery,
  recordCheck,
  rejectPR,
  submitPR,
} from '../../lib/orders'
import { Button, Field, Input, Modal, Textarea } from '../../components/ui'
import { PhotoCapture } from '../../components/PhotoCapture'
import type { Attachment, Order } from '../../types'

type Dialog = null | 'reject' | 'decline' | 'dispatch' | 'receive' | 'check'

export function OrderActions({ order }: { order: Order }) {
  const profile = useAuth((s) => s.profile)!
  const [dialog, setDialog] = useState<Dialog>(null)
  const [text, setText] = useState('')
  const [checkNo, setCheckNo] = useState('')
  const [photo, setPhoto] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)

  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => s.status === 'active').toArray(), [], [])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      setDialog(null)
      setText('')
      setCheckNo('')
      setPhoto(null)
    } finally {
      setBusy(false)
    }
  }

  const allow = (p: Parameters<typeof canActNow>[1]) => canActNow(profile.role, p, order.status)
  const actions: React.ReactNode[] = []

  if (allow('pr.submit'))
    actions.push(
      <Button key="submit" onClick={() => run(() => submitPR(order.id, profile))} disabled={busy} full>
        Submit for approval
      </Button>,
    )
  if (allow('pr.approve'))
    actions.push(
      <Button key="approve" onClick={() => run(() => approvePR(order.id, profile))} disabled={busy} full>
        Approve request
      </Button>,
    )
  if (allow('pr.reject'))
    actions.push(
      <Button key="reject" variant="secondary" onClick={() => setDialog('reject')} full>
        Return with comment
      </Button>,
    )
  if (allow('po.issue'))
    actions.push(
      <Button
        key="po"
        onClick={() =>
          run(() => issuePO(order.id, profile, order.supplier_id ?? (suppliers ?? [])[0]?.id ?? ''))
        }
        disabled={busy || (!order.supplier_id && !(suppliers ?? []).length)}
        full
      >
        Issue Purchase Order
      </Button>,
    )
  if (allow('po.accept'))
    actions.push(
      <Button key="accept" onClick={() => run(() => acceptPO(order.id, profile))} disabled={busy} full>
        Accept order
      </Button>,
    )
  if (allow('po.decline'))
    actions.push(
      <Button key="decline" variant="secondary" onClick={() => setDialog('decline')} full>
        Decline
      </Button>,
    )
  if (allow('delivery.dispatch'))
    actions.push(
      <Button key="dispatch" onClick={() => setDialog('dispatch')} full>
        Mark as dispatched
      </Button>,
    )
  if (allow('delivery.receive'))
    actions.push(
      <Button key="receive" onClick={() => setDialog('receive')} full>
        Receive & sign IAR
      </Button>,
    )
  if (allow('dv.issue'))
    actions.push(
      <Button key="dv" onClick={() => run(() => issueDV(order.id, profile))} disabled={busy} full>
        Generate Disbursement Voucher
      </Button>,
    )
  if (allow('check.capture'))
    actions.push(
      <Button key="check" onClick={() => setDialog('check')} full>
        Record cheque payment
      </Button>,
    )
  if (allow('bir2307.issue') && !order.bir_2307_issued)
    actions.push(
      <Button key="2307" variant="accent" onClick={() => run(() => issue2307(order.id, profile))} disabled={busy} full>
        Issue BIR Form 2307
      </Button>,
    )
  if (order.status === 'paid' && order.bir_2307_issued && can(profile.role, 'bir2307.issue'))
    actions.push(
      <Button key="archive" variant="secondary" onClick={() => run(() => archiveOrder(order.id, profile))} full>
        Archive transaction
      </Button>,
    )

  return (
    <>
      {actions.length > 0 && <div className="no-print flex flex-col gap-2">{actions}</div>}

      <Modal open={dialog === 'reject'} onClose={() => setDialog(null)} title="Return this request">
        <Field label="Reason" hint="The custodian sees this in the order thread.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Quantity for bond paper exceeds the quarterly allocation." />
        </Field>
        <Button className="mt-4" full disabled={!text.trim() || busy} onClick={() => run(() => rejectPR(order.id, profile, text.trim()))}>
          Return to custodian
        </Button>
      </Modal>

      <Modal open={dialog === 'decline'} onClose={() => setDialog(null)} title="Decline this order">
        <Field label="Reason">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Item out of stock until next month." />
        </Field>
        <Button className="mt-4" variant="danger" full disabled={!text.trim() || busy} onClick={() => run(() => declinePO(order.id, profile, text.trim()))}>
          Decline order
        </Button>
      </Modal>

      <Modal open={dialog === 'dispatch'} onClose={() => setDialog(null)} title="Dispatch delivery">
        <Field label="Delivery note" hint="Optional — driver, plate number, expected arrival.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Out for delivery today, arriving before noon. Driver: Ka Ben, ABC 1234." />
        </Field>
        <Button className="mt-4" full disabled={busy} onClick={() => run(() => dispatchOrder(order.id, profile, text.trim()))}>
          Mark dispatched
        </Button>
      </Modal>

      <Modal open={dialog === 'receive'} onClose={() => setDialog(null)} title="Inspection & Acceptance">
        <p className="mb-3 text-xs text-ink-400">
          Signing generates the IAR and records that the goods were inspected and found in order as to quantity and
          specification.
        </p>
        <Field label="Type your full name to sign">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={profile.full_name} />
        </Field>
        <Button className="mt-4" full disabled={!text.trim() || busy} onClick={() => run(() => receiveDelivery(order.id, profile, text.trim()))}>
          Sign IAR & accept delivery
        </Button>
      </Modal>

      <Modal open={dialog === 'check'} onClose={() => setDialog(null)} title="Record cheque payment">
        <Field label="Cheque number">
          <Input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} placeholder="0012345" inputMode="numeric" />
        </Field>
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-400">Cheque photo</p>
        <PhotoCapture kind="check_photo" value={photo} onChange={setPhoto} label="Photograph cheque" />
        <Button
          className="mt-4"
          full
          disabled={!checkNo.trim() || busy}
          onClick={() => run(() => recordCheck(order.id, profile, checkNo.trim(), photo?.id ?? null))}
        >
          Record payment
        </Button>
      </Modal>
    </>
  )
}
