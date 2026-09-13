import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { peso } from '../../lib/money'
import { formatDateTime } from '../../lib/ids'
import { can } from '../../lib/permissions'
import {
  STOCK_LABEL,
  STOCK_TONE,
  moveStock,
  movesForSupplier,
  stockState,
  type StockState,
} from '../../lib/inventory'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Stat, Textarea, cx } from '../../components/ui'
import { Pager } from '../../components/Pager'
import { usePaged } from '../../lib/usePaged'
import {
  STOCK_REASON_LABEL,
  UNIT_LABEL,
  formatQty,
  type CatalogItem,
  type StockMoveReason,
} from '../../types'

const FILTERS: { key: 'all' | StockState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Out' },
  { key: 'untracked', label: 'Not tracked' },
]

const MANUAL_REASONS: StockMoveReason[] = ['received', 'adjustment', 'damaged']

export function InventoryPage() {
  const profile = useAuth((s) => s.profile)!
  const [filter, setFilter] = useState<'all' | StockState>('all')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'stock' | 'ledger'>('stock')
  const [adjusting, setAdjusting] = useState<CatalogItem | null>(null)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<StockMoveReason>('received')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const items = useLiveQuery(
    () => db.catalog_items.where('supplier_id').equals(profile.supplier_id!).toArray(),
    [profile.supplier_id],
    [] as CatalogItem[],
  )
  const moves = useLiveQuery(() => movesForSupplier(profile.supplier_id!), [profile.supplier_id], [])

  const all = items ?? []
  const term = q.trim().toLowerCase()
  const rows = all.filter(
    (i) =>
      (filter === 'all' || stockState(i) === filter) &&
      (term === '' || i.name.toLowerCase().includes(term)),
  )
  const paged = usePaged(rows, 12, `${filter}|${term}`)
  const ledger = usePaged(moves ?? [], 15, 'ledger')

  const lowCount = all.filter((i) => stockState(i) === 'low').length
  const outCount = all.filter((i) => stockState(i) === 'out').length
  /* Stock is valued at what it cost, not at what it might sell for. */
  const stockValue = all.reduce((sum, i) => sum + i.stock_on_hand * i.base_cost, 0)

  const canAdjust = can(profile.role, 'catalog.manage')

  const submit = async () => {
    if (!adjusting) return
    const n = Number(qty)
    if (!n) return
    setBusy(true)
    try {
      /* "Damaged" always removes; the others take the sign the user typed. */
      const signed = reason === 'damaged' ? -Math.abs(n) : n
      await moveStock(profile, adjusting, signed, reason, { note: note.trim() })
      setAdjusting(null)
      setQty('')
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">Inventory</h1>
        <p className="text-sm text-ink-400">Stock on hand, and every movement that changed it.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items" value={all.length} />
        <Stat label="Low stock" value={lowCount} tone={lowCount ? 'accent' : undefined} />
        <Stat label="Out of stock" value={outCount} tone={outCount ? 'accent' : undefined} />
        <Stat label="Stock at cost" value={peso(stockValue)} />
      </div>

      <div className="flex gap-2 border-b border-[rgba(120,80,50,0.12)] pb-3">
        {([['stock', 'Stock'], ['ledger', 'Movements']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              tab === k
                ? 'bg-gradient-to-b from-[#c2643f] to-[#a24e33] text-white shadow-[0_6px_16px_-8px_rgba(140,66,38,0.8)]'
                : 'glass-quiet text-ink-600',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cx(
                  'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
                  filter === f.key
                    ? 'bg-gradient-to-b from-[#c2643f] to-[#a24e33] text-white'
                    : 'glass-quiet text-ink-600',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" />

          {rows.length === 0 ? (
            <Empty title="Nothing here" hint="Adjust the filter, or add items in the Catalog." />
          ) : (
            <Card>
              <ul className="divide-y divide-[rgba(120,80,50,0.1)]">
                {paged.rows.map((i) => {
                  const state = stockState(i)
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink-900">{i.name}</p>
                        <p className="truncate text-xs text-ink-400">
                          {peso(i.selling_price)} per {UNIT_LABEL[i.unit].toLowerCase()}
                          {i.pack_size > 0 && ` · ${i.pack_size} per ${UNIT_LABEL[i.unit].toLowerCase()}`}
                          {i.stock_updated_at && ` · updated ${formatDateTime(i.stock_updated_at)}`}
                        </p>
                      </div>
                      <Badge tone={STOCK_TONE[state]}>{STOCK_LABEL[state]}</Badge>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-ink-900">
                          {formatQty(i.stock_on_hand, i.unit)}
                        </p>
                        {i.reorder_level > 0 && (
                          <p className="text-[11px] text-ink-400">reorder at {i.reorder_level}</p>
                        )}
                      </div>
                      {canAdjust && (
                        <Button variant="secondary" onClick={() => setAdjusting(i)}>
                          Adjust
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
              <Pager paged={paged} unit="items" />
            </Card>
          )}
        </>
      )}

      {tab === 'ledger' && (
        <Card title="Stock movements" subtitle="Append-only — each row carries the balance it left behind">
          {(moves ?? []).length === 0 ? (
            <Empty title="No movements yet" hint="Receiving stock or accepting an order records a movement here." />
          ) : (
            <>
              <ul className="divide-y divide-[rgba(120,80,50,0.1)]">
                {ledger.rows.map((m) => {
                  const item = all.find((i) => i.id === m.catalog_item_id)
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-3">
                      <span
                        className={cx(
                          'w-16 shrink-0 text-right text-sm font-black tabular-nums',
                          m.qty >= 0 ? 'text-[#5f7740]' : 'text-[#a13a33]',
                        )}
                      >
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{item?.name ?? 'Removed item'}</p>
                        <p className="truncate text-xs text-ink-400">
                          {STOCK_REASON_LABEL[m.reason]}
                          {m.note && ` · ${m.note}`}
                        </p>
                        <p className="text-[11px] text-ink-400">
                          {m.actor_name} · {formatDateTime(m.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-600">
                        → {m.balance_after}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <Pager paged={ledger} unit="movements" />
            </>
          )}
        </Card>
      )}

      <Modal open={!!adjusting} onClose={() => setAdjusting(null)} title={`Adjust ${adjusting?.name ?? ''}`}>
        {adjusting && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              On hand now: <span className="font-bold">{formatQty(adjusting.stock_on_hand, adjusting.unit)}</span>
            </p>
            <Field label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value as StockMoveReason)}>
                {MANUAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {STOCK_REASON_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Quantity in ${UNIT_LABEL[adjusting.unit].toLowerCase()}`}
              hint={
                reason === 'damaged'
                  ? 'Always removed from stock.'
                  : 'Use a negative number to remove, e.g. -5.'
              }
            >
              <Input
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ''))}
                placeholder="0"
              />
            </Field>
            <Field label="Note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" placeholder="Delivery receipt 1123" />
            </Field>
            <Button full onClick={submit} disabled={busy || !Number(qty)}>
              {busy ? 'Saving…' : 'Record movement'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
