import { db } from './db/dexie'
import { nowIso } from './ids'
import type { Message, Order, Profile, ThreadRead } from '../types'

/** Statuses at which a supplier may see an order at all (mirrors RLS). */
const SUPPLIER_HIDDEN = ['draft', 'pr_submitted', 'pr_approved', 'pr_rejected']

export interface ThreadSummary {
  order: Order
  lastMessage: Message | null
  /** Counterpart name — who you are actually talking to. */
  counterpart: string
  unread: number
}

const readId = (profileId: string, orderId: string) => `${profileId}:${orderId}`

export async function markThreadRead(profileId: string, orderId: string) {
  const row: ThreadRead = {
    id: readId(profileId, orderId),
    profile_id: profileId,
    order_id: orderId,
    last_read_at: nowIso(),
  }
  await db.thread_reads.put(row)
}

/**
 * Unread means a message written by someone else since this user last opened
 * the thread. System events are excluded — the lifecycle already surfaces
 * those as status changes, and counting them would leave a permanent badge on
 * every order nobody has chatted about.
 */
function unreadCount(messages: Message[], profileId: string, lastReadAt: string | null) {
  return messages.filter(
    (m) =>
      m.kind === 'user' &&
      m.author_id !== profileId &&
      (!lastReadAt || m.created_at > lastReadAt),
  ).length
}

export async function ordersForProfile(profile: Profile): Promise<Order[]> {
  if (profile.school_id) {
    return db.orders.where('school_id').equals(profile.school_id).toArray()
  }
  if (profile.supplier_id) {
    const rows = await db.orders.where('supplier_id').equals(profile.supplier_id).toArray()
    return rows.filter((o) => !SUPPLIER_HIDDEN.includes(o.status))
  }
  return db.orders.toArray()
}

export async function loadThreads(profile: Profile): Promise<ThreadSummary[]> {
  const orders = await ordersForProfile(profile)
  if (orders.length === 0) return []

  const ids = new Set(orders.map((o) => o.id))
  const [allMessages, reads, schools, suppliers] = await Promise.all([
    db.messages.toArray(),
    db.thread_reads.where('profile_id').equals(profile.id).toArray(),
    db.schools.toArray(),
    db.suppliers.toArray(),
  ])

  const byOrder = new Map<string, Message[]>()
  for (const m of allMessages) {
    if (!ids.has(m.order_id)) continue
    const list = byOrder.get(m.order_id)
    if (list) list.push(m)
    else byOrder.set(m.order_id, [m])
  }
  const readAt = new Map(reads.map((r) => [r.order_id, r.last_read_at]))

  const summaries = orders.map((order) => {
    const msgs = (byOrder.get(order.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const userMsgs = msgs.filter((m) => m.kind === 'user')
    /* A school talks to the supplier and vice versa; the owner sees the school. */
    const counterpart = profile.supplier_id
      ? (schools.find((s) => s.id === order.school_id)?.name ?? 'School')
      : (suppliers.find((s) => s.id === order.supplier_id)?.name ?? 'Not yet assigned')
    return {
      order,
      lastMessage: userMsgs.at(-1) ?? msgs.at(-1) ?? null,
      counterpart,
      unread: unreadCount(msgs, profile.id, readAt.get(order.id) ?? null),
    }
  })

  return summaries.sort((a, b) => {
    const at = a.lastMessage?.created_at ?? a.order.created_at
    const bt = b.lastMessage?.created_at ?? b.order.created_at
    return bt.localeCompare(at)
  })
}

export async function totalUnread(profile: Profile): Promise<number> {
  const threads = await loadThreads(profile)
  return threads.reduce((sum, t) => sum + t.unread, 0)
}
