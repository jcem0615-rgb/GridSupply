import { db } from './db/dexie'
import { enqueue } from './db/repo'
import { docNumber, nowIso, uuid } from './ids'
import { round2 } from './money'
import type {
  Message,
  Order,
  OrderEvent,
  OrderLine,
  OrderStatus,
  Profile,
  Role,
} from '../types'

async function nextSeq(prefix: 'PR' | 'PO' | 'DV' | 'IAR') {
  const orders = await db.orders.toArray()
  const field = { PR: 'pr_number', PO: 'po_number', DV: 'dv_number', IAR: 'iar_number' } as const
  const used = orders
    .map((o) => o[field[prefix]])
    .filter(Boolean)
    .map((n) => Number(String(n).split('-').pop()))
    .filter((n) => !Number.isNaN(n))
  return (used.length ? Math.max(...used) : 0) + 1
}

async function logEvent(
  orderId: string,
  actor: Profile,
  from: OrderStatus | null,
  to: OrderStatus | null,
  note: string,
) {
  const event: OrderEvent = {
    id: uuid(),
    order_id: orderId,
    actor_id: actor.id,
    actor_name: actor.full_name,
    actor_role: actor.role,
    status_from: from,
    status_to: to,
    note,
    created_at: nowIso(),
  }
  await db.order_events.put(event)
  await enqueue('order_events', 'insert', event as unknown as Record<string, unknown>, event.id)
  await postSystemMessage(orderId, note)
  return event
}

/** System events are injected into the order thread (docs/07). */
export async function postSystemMessage(orderId: string, body: string) {
  const msg: Message = {
    id: uuid(),
    client_uuid: uuid(),
    order_id: orderId,
    author_id: null,
    author_name: 'GridSupply',
    author_role: 'system',
    kind: 'system',
    body,
    attachment_id: null,
    created_at: nowIso(),
  }
  await db.messages.put(msg)
  await enqueue('messages', 'insert', msg as unknown as Record<string, unknown>, msg.client_uuid)
}

export async function postMessage(
  orderId: string,
  actor: Profile,
  body: string,
  attachmentId: string | null = null,
) {
  const msg: Message = {
    id: uuid(),
    client_uuid: uuid(),
    order_id: orderId,
    author_id: actor.id,
    author_name: actor.full_name,
    author_role: actor.role as Role,
    kind: 'user',
    body,
    attachment_id: attachmentId,
    created_at: nowIso(),
  }
  await db.messages.put(msg)
  await enqueue('messages', 'insert', msg as unknown as Record<string, unknown>, msg.client_uuid)
  return msg
}

export interface DraftLine {
  catalog_item_id: string | null
  name: string
  description: string
  unit: OrderLine['unit']
  qty: number
  unit_price: number
}

export async function createPR(
  actor: Profile,
  input: {
    supplier_id: string | null
    purpose: string
    fund_source: string
    lines: DraftLine[]
    supplier_vat_registered: boolean
  },
) {
  const id = uuid()
  const seq = await nextSeq('PR')
  const lines: OrderLine[] = input.lines.map((l) => ({
    id: uuid(),
    order_id: id,
    catalog_item_id: l.catalog_item_id,
    name: l.name,
    description: l.description,
    unit: l.unit,
    qty: l.qty,
    unit_price: l.unit_price,
    line_total: round2(l.qty * l.unit_price),
  }))
  const order: Order = {
    id,
    client_uuid: uuid(),
    school_id: actor.school_id!,
    supplier_id: input.supplier_id,
    status: 'draft',
    pr_number: docNumber('PR', seq),
    po_number: null,
    dv_number: null,
    iar_number: null,
    purpose: input.purpose,
    fund_source: input.fund_source,
    gross_total: round2(lines.reduce((s, l) => s + l.line_total, 0)),
    supplier_vat_registered: input.supplier_vat_registered,
    requested_by: actor.id,
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    po_issued_at: null,
    accepted_at: null,
    dispatched_at: null,
    delivered_at: null,
    received_by: null,
    iar_signature: null,
    dv_issued_at: null,
    paid_at: null,
    check_number: null,
    check_photo_id: null,
    bir_2307_issued: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await db.transaction('rw', [db.orders, db.order_lines, db.order_events, db.messages, db.outbox], async () => {
    await db.orders.put(order)
    await db.order_lines.bulkPut(lines)
    await enqueue('orders', 'insert', order as unknown as Record<string, unknown>, order.client_uuid)
    for (const l of lines) {
      await enqueue('order_lines', 'insert', l as unknown as Record<string, unknown>, l.id)
    }
    await logEvent(id, actor, null, 'draft', `${order.pr_number} drafted by ${actor.full_name}.`)
  })
  return order
}

export async function replaceLines(orderId: string, actor: Profile, lines: DraftLine[]) {
  const rows: OrderLine[] = lines.map((l) => ({
    id: uuid(),
    order_id: orderId,
    catalog_item_id: l.catalog_item_id,
    name: l.name,
    description: l.description,
    unit: l.unit,
    qty: l.qty,
    unit_price: l.unit_price,
    line_total: round2(l.qty * l.unit_price),
  }))
  const existing = await db.order_lines.where('order_id').equals(orderId).toArray()
  await db.order_lines.bulkDelete(existing.map((e) => e.id))
  for (const e of existing) await enqueue('order_lines', 'delete', { id: e.id }, e.id)
  await db.order_lines.bulkPut(rows)
  for (const r of rows) await enqueue('order_lines', 'insert', r as unknown as Record<string, unknown>, r.id)
  const gross = round2(rows.reduce((s, l) => s + l.line_total, 0))
  await patchOrder(orderId, actor, { gross_total: gross }, null, 'Line items updated.')
  return rows
}

/** Single write path for every order mutation — keeps Dexie and the outbox in step. */
export async function patchOrder(
  orderId: string,
  actor: Profile,
  patch: Partial<Order>,
  nextStatus: OrderStatus | null,
  note: string,
) {
  const current = await db.orders.get(orderId)
  if (!current) throw new Error('Order not found')
  const updated: Order = {
    ...current,
    ...patch,
    ...(nextStatus ? { status: nextStatus } : {}),
    updated_at: nowIso(),
  }
  await db.orders.put(updated)
  await enqueue('orders', 'update', updated as unknown as Record<string, unknown>, updated.client_uuid)
  await logEvent(orderId, actor, current.status, nextStatus, note)
  return updated
}

export const submitPR = (id: string, a: Profile) =>
  patchOrder(id, a, {}, 'pr_submitted', `PR submitted for approval.`)

export const approvePR = (id: string, a: Profile) =>
  patchOrder(
    id,
    a,
    { approved_by: a.id, approved_at: nowIso(), rejection_reason: null },
    'pr_approved',
    `PR approved by ${a.full_name}.`,
  )

export const rejectPR = (id: string, a: Profile, reason: string) =>
  patchOrder(id, a, { rejection_reason: reason }, 'pr_rejected', `PR returned by ${a.full_name}: ${reason}`)

export async function issuePO(id: string, actor: Profile, supplierId: string) {
  const seq = await nextSeq('PO')
  const po = docNumber('PO', seq)
  return patchOrder(
    id,
    actor,
    { po_number: po, supplier_id: supplierId, po_issued_at: nowIso() },
    'po_issued',
    `${po} issued to supplier.`,
  )
}

export const acceptPO = (id: string, a: Profile) =>
  patchOrder(id, a, { accepted_at: nowIso() }, 'po_accepted', `PO accepted by ${a.full_name}.`)

export const declinePO = (id: string, a: Profile, reason: string) =>
  patchOrder(id, a, { rejection_reason: reason }, 'po_declined', `PO declined: ${reason}`)

export const dispatchOrder = (id: string, a: Profile, note: string) =>
  patchOrder(id, a, { dispatched_at: nowIso() }, 'dispatched', note || 'Goods dispatched for delivery.')

export async function receiveDelivery(id: string, actor: Profile, signature: string) {
  const seq = await nextSeq('IAR')
  const iar = docNumber('IAR', seq)
  return patchOrder(
    id,
    actor,
    {
      iar_number: iar,
      delivered_at: nowIso(),
      received_by: actor.id,
      iar_signature: signature,
    },
    'delivered',
    `${iar} signed — goods inspected and accepted by ${actor.full_name}.`,
  )
}

export async function issueDV(id: string, actor: Profile) {
  const seq = await nextSeq('DV')
  const dv = docNumber('DV', seq)
  return patchOrder(id, actor, { dv_number: dv, dv_issued_at: nowIso() }, 'dv_issued', `${dv} issued.`)
}

export const recordCheck = (id: string, a: Profile, checkNumber: string, photoId: string | null) =>
  patchOrder(
    id,
    a,
    { check_number: checkNumber, check_photo_id: photoId, paid_at: nowIso() },
    'paid',
    `Cheque ${checkNumber} released to supplier.`,
  )

/**
 * The school records the supplier's VAT registration for this order. Changing
 * it restates every withholding, so it is locked once the DV exists — a voucher
 * already cut must not have its numbers move underneath it.
 */
export const setSupplierVatStatus = (id: string, a: Profile, vatRegistered: boolean) =>
  patchOrder(
    id,
    a,
    { supplier_vat_registered: vatRegistered },
    null,
    `Supplier recorded as ${vatRegistered ? 'VAT-registered' : 'non-VAT'} for this purchase.`,
  )

/** Lets the school attach or replace the cheque image after payment was recorded —
 *  a cheque photographed in the field may arrive after the voucher was cut. */
export const attachChequePhoto = (id: string, a: Profile, photoId: string, replacing: boolean) =>
  patchOrder(
    id,
    a,
    { check_photo_id: photoId },
    null,
    replacing ? 'Cheque photo replaced.' : 'Cheque photo attached.',
  )

export const issue2307 = (id: string, a: Profile) =>
  patchOrder(id, a, { bir_2307_issued: true }, 'paid', 'BIR Form 2307 issued to supplier.')

export const archiveOrder = (id: string, a: Profile) =>
  patchOrder(id, a, {}, 'archived', 'Transaction archived.')
