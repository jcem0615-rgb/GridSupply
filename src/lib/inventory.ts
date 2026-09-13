import { db } from './db/dexie'
import { put } from './db/repo'
import { nowIso, uuid } from './ids'
import { UNIT_LABEL, UNIT_PLURAL, formatQty } from '../types'
import type { CatalogItem, ItemUnit, Order, Profile, StockMove, StockMoveReason } from '../types'

export type StockState = 'out' | 'low' | 'ok' | 'untracked'

/**
 * An item with no reorder level is not being tracked — a supplier who never set
 * one should not be nagged about it. Zero stock on a tracked item is "out",
 * which is worth surfacing loudly; a supplier can still sell it, because
 * accepting a PO they cannot fill is their commercial decision, not ours.
 */
export function stockState(item: CatalogItem): StockState {
  if (item.reorder_level <= 0 && item.stock_on_hand <= 0) return 'untracked'
  if (item.stock_on_hand <= 0) return 'out'
  if (item.reorder_level > 0 && item.stock_on_hand <= item.reorder_level) return 'low'
  return 'ok'
}

export const STOCK_TONE: Record<StockState, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  ok: 'ok',
  low: 'warn',
  out: 'bad',
  untracked: 'neutral',
}

export const STOCK_LABEL: Record<StockState, string> = {
  ok: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  untracked: 'Not tracked',
}

/**
 * How a movement was counted before it reached the ledger. Stock arrives in
 * whatever the delivery was packed in — ten boxes of twelve reams — but the
 * ledger holds one unit, the item's own, or `balance_after` means nothing.
 * Omit it and the count is taken as already being in that unit.
 */
export interface StockEntry {
  unit: ItemUnit
  /** Stocking units in one `unit`. 1 when counting in the item's own unit. */
  factor: number
}

/** A plain count, in whatever unit the item is stocked in. */
export const plainEntry = (item: CatalogItem): StockEntry => ({ unit: item.unit, factor: 1 })

/**
 * A factor is only meaningful between two different units, and only a whole
 * number of stocking units fits in a pack — half a ream in a box is a data
 * entry mistake, not a delivery.
 */
export function normaliseEntry(item: CatalogItem, entry: StockEntry): StockEntry {
  if (entry.unit === item.unit) return plainEntry(item)
  return { unit: entry.unit, factor: Math.max(1, Math.round(entry.factor)) }
}

/** "10 Boxes = 120 Reams" — the sentence the adjust form and the ledger show. */
export function describeEntry(item: CatalogItem, qty: number, entry: StockEntry): string {
  const e = normaliseEntry(item, entry)
  const counted = `${Math.abs(qty)} ${Math.abs(qty) === 1 ? UNIT_LABEL[e.unit] : UNIT_PLURAL[e.unit]}`
  if (e.factor === 1 && e.unit === item.unit) return counted
  return `${counted} × ${formatQty(e.factor, item.unit)} = ${formatQty(Math.abs(qty) * e.factor, item.unit)}`
}

/**
 * Applies a signed movement and records it in the ledger.
 *
 * `qty` is counted in `entry.unit` and converted to the item's stocking unit
 * before it touches the balance. The ledger keeps both, so a wrong balance is
 * legible against the entry that produced it rather than silently correct.
 *
 * The ledger is append-only and each row carries the balance after it, so the
 * history reads without replaying every move.
 */
export async function moveStock(
  actor: Profile,
  item: CatalogItem,
  qty: number,
  reason: StockMoveReason,
  opts: { note?: string; orderId?: string | null; entry?: StockEntry } = {},
): Promise<CatalogItem> {
  const entry = normaliseEntry(item, opts.entry ?? plainEntry(item))
  const inStockingUnits = qty * entry.factor

  /* Stock never goes negative: a ledger that can imply -3 boxes on hand is a
     ledger nobody trusts. */
  const balance = Math.max(0, item.stock_on_hand + inStockingUnits)
  const applied = balance - item.stock_on_hand
  const updated: CatalogItem = { ...item, stock_on_hand: balance, stock_updated_at: nowIso() }

  await put('catalog_items', updated, 'update')

  const move: StockMove = {
    id: uuid(),
    supplier_id: item.supplier_id,
    catalog_item_id: item.id,
    qty: applied,
    balance_after: balance,
    entry_qty: qty,
    entry_unit: entry.unit,
    entry_factor: entry.factor,
    reason,
    order_id: opts.orderId ?? null,
    note: opts.note ?? '',
    actor_id: actor.id,
    actor_name: actor.full_name,
    created_at: nowIso(),
  }
  await put('stock_moves', move, 'insert')
  return updated
}

/**
 * Draws down stock for every catalogued line on an order. Called when a
 * supplier accepts a PO, which is the point they commit to filling it.
 * Free-text lines carry no catalog_item_id and are skipped.
 */
export async function consumeForOrder(actor: Profile, order: Order, direction: 1 | -1 = -1) {
  const lines = await db.order_lines.where('order_id').equals(order.id).toArray()
  const reason: StockMoveReason = direction === -1 ? 'order_accepted' : 'order_declined'

  for (const line of lines) {
    if (!line.catalog_item_id) continue
    const item = await db.catalog_items.get(line.catalog_item_id)
    if (!item) continue
    /* A catalogued line copies the item's unit in the PR wizard, so an order
       draw-down is always a plain count — there is nothing to convert. */
    await moveStock(actor, item, direction * line.qty, reason, {
      orderId: order.id,
      note: `${order.po_number ?? order.pr_number} — ${line.name}`,
      entry: plainEntry(item),
    })
  }
}

export async function movesForSupplier(supplierId: string, limit = 100): Promise<StockMove[]> {
  const rows = await db.stock_moves.where('supplier_id').equals(supplierId).toArray()
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
}
