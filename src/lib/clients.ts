import { db } from './db/dexie'
import { nowIso } from './ids'
import { round2 } from './money'
import type { Order, School, SupplierClient } from '../types'

/** Statuses a supplier can see (mirrors the RLS rule on orders). */
const HIDDEN = ['draft', 'pr_submitted', 'pr_approved', 'pr_rejected']

export interface ClientSummary {
  school: School
  record: SupplierClient | null
  orders: Order[]
  orderCount: number
  /** Gross of orders that have been paid. */
  transacted: number
  /** Gross of live orders not yet paid — what is still in flight. */
  open: number
  lastOrderAt: string | null
}

export const clientId = (supplierId: string, schoolId: string) => `${supplierId}:${schoolId}`

export function blankClient(supplierId: string, schoolId: string): SupplierClient {
  return {
    id: clientId(supplierId, schoolId),
    supplier_id: supplierId,
    school_id: schoolId,
    contact_name: '',
    contact_number: '',
    contact_email: '',
    delivery_notes: '',
    notes: '',
    updated_at: nowIso(),
  }
}

/**
 * A supplier's clients are the schools that have actually issued them a
 * purchase order — not every school on the platform. A school browsing the
 * catalog is not yet a client, and listing it as one would overstate the
 * relationship on a page suppliers use to plan calls and deliveries.
 */
export async function loadClients(supplierId: string): Promise<ClientSummary[]> {
  const orders = (await db.orders.where('supplier_id').equals(supplierId).toArray()).filter(
    (o) => !HIDDEN.includes(o.status),
  )
  if (orders.length === 0) return []

  const schoolIds = [...new Set(orders.map((o) => o.school_id))]
  const [schools, records] = await Promise.all([
    db.schools.bulkGet(schoolIds),
    db.supplier_clients.where('supplier_id').equals(supplierId).toArray(),
  ])
  const recordFor = new Map(records.map((r) => [r.school_id, r]))

  const summaries = schoolIds.flatMap<ClientSummary>((id) => {
    const school = schools.find((s) => s?.id === id)
    if (!school) return []
    const mine = orders.filter((o) => o.school_id === id)
    const paid = mine.filter((o) => o.paid_at)
    const live = mine.filter((o) => !o.paid_at && o.status !== 'archived' && o.status !== 'po_declined')
    return [
      {
        school,
        record: recordFor.get(id) ?? null,
        orders: mine.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        orderCount: mine.length,
        transacted: round2(paid.reduce((sum, o) => sum + o.gross_total, 0)),
        open: round2(live.reduce((sum, o) => sum + o.gross_total, 0)),
        lastOrderAt: mine.map((o) => o.created_at).sort().at(-1) ?? null,
      },
    ]
  })

  return summaries.sort((a, b) => (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? ''))
}

export async function loadClient(supplierId: string, schoolId: string): Promise<ClientSummary | null> {
  const all = await loadClients(supplierId)
  return all.find((c) => c.school.id === schoolId) ?? null
}
