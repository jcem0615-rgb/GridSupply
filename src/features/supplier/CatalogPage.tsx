import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { peso, sellingPrice, computeTax } from '../../lib/money'
import { nowIso, uuid } from '../../lib/ids'
import { put, remove } from '../../lib/db/repo'
import { getTaxConfig } from '../../lib/db/seed'
import { can } from '../../lib/permissions'
import { Button, Card, Empty, Field, Input, Modal, Select, Textarea, cx } from '../../components/ui'
import { Pager } from '../../components/Pager'
import { usePaged } from '../../lib/usePaged'
import type { CatalogItem, ItemUnit } from '../../types'

const UNITS: ItemUnit[] = ['pc', 'box', 'ream', 'pack', 'set', 'bot', 'unit']

const blank = (supplierId: string): CatalogItem => ({
  id: uuid(),
  supplier_id: supplierId,
  name: '',
  description: '',
  unit: 'pc',
  base_cost: 0,
  markup_pct: 20,
  selling_price: 0,
  active: true,
  created_at: nowIso(),
})

export function CatalogPage() {
  const profile = useAuth((s) => s.profile)!
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [q, setQ] = useState('')

  const items = useLiveQuery(
    () => db.catalog_items.where('supplier_id').equals(profile.supplier_id!).toArray(),
    [profile.supplier_id],
    [],
  )
  const tax = useLiveQuery(() => getTaxConfig(), [])

  const canPrice = can(profile.role, 'catalog.pricing')
  const term = q.trim().toLowerCase()
  const rows = (items ?? []).filter(
    (i) => term === '' || i.name.toLowerCase().includes(term) || i.description.toLowerCase().includes(term),
  )
  const paged = usePaged(rows, 12, term)

  const save = async () => {
    if (!editing) return
    const row: CatalogItem = {
      ...editing,
      selling_price: sellingPrice(editing.base_cost, editing.markup_pct),
    }
    await put('catalog_items', row, 'insert')
    setEditing(null)
  }

  const preview = editing && tax ? computeTax(sellingPrice(editing.base_cost, editing.markup_pct), tax) : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink-900">Catalog</h1>
          <p className="text-sm text-ink-400">{(items ?? []).length} items published to schools</p>
        </div>
        <Button onClick={() => setEditing(blank(profile.supplier_id!))}>Add item</Button>
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog…" />

      {rows.length === 0 ? (
        <Empty
          title={term ? 'No matching items' : 'No items yet'}
          hint={term ? 'Try a different search term.' : 'Add your first item — schools only see items marked active.'}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {paged.rows.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-bold text-ink-900">
                    {i.name}
                    {!i.active && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-400">hidden</span>}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    Cost {peso(i.base_cost)} · +{i.markup_pct}% · per {i.unit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-ink-900">{peso(i.selling_price)}</p>
                  <button onClick={() => setEditing(i)} className="text-[11px] font-semibold text-brand">
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pager paged={paged} unit="items" />
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.name ? 'Edit item' : 'New item'}>
        {editing && (
          <div className="space-y-4">
            <Field label="Item name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Bond Paper A4" />
            </Field>
            <Field label="Description">
              <Textarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Substance 20, 500 sheets per ream"
                className="min-h-16"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit">
                <Select value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value as ItemUnit })}>
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Base cost">
                <Input
                  inputMode="decimal"
                  value={editing.base_cost || ''}
                  onChange={(e) => setEditing({ ...editing, base_cost: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                  disabled={!canPrice}
                />
              </Field>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Markup</span>
                <span className="text-sm font-black text-accent">{editing.markup_pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={editing.markup_pct}
                disabled={!canPrice}
                onChange={(e) => setEditing({ ...editing, markup_pct: Number(e.target.value) })}
                className="w-full accent-[#a8651f] disabled:opacity-40"
              />
              {!canPrice && <p className="mt-1 text-[11px] text-ink-400">Only the supplier owner can change pricing.</p>}
            </div>

            <div className="rounded-xl bg-ink-50 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase text-ink-400">Price to school</span>
                <span className="text-lg font-black tabular-nums text-ink-900">
                  {peso(sellingPrice(editing.base_cost, editing.markup_pct))}
                </span>
              </div>
              {preview && tax && (
                <dl className="mt-3 space-y-1 border-t border-ink-200 pt-3 text-[11px]">
                  <p className="mb-1 font-bold uppercase text-ink-400">If a school buys 1 {editing.unit}</p>
                  <div className="flex justify-between">
                    <dt className="text-ink-400">Less EWT {(tax.ewt_rate * 100).toFixed(0)}%</dt>
                    <dd className="tabular-nums text-red-600">−{peso(preview.ewt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-400">Less final VAT {(tax.final_vat_withheld_rate * 100).toFixed(0)}%</dt>
                    <dd className="tabular-nums text-red-600">−{peso(preview.vatWithheld)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-ink-200 pt-1 font-bold">
                    <dt>You receive</dt>
                    <dd className="tabular-nums">{peso(preview.netPayable)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-400">Margin over cost</dt>
                    <dd
                      className={cx(
                        'tabular-nums font-bold',
                        preview.netPayable - editing.base_cost >= 0 ? 'text-[#5f7740]' : 'text-red-600',
                      )}
                    >
                      {peso(preview.netPayable - editing.base_cost)}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                className="h-4 w-4 accent-[#b4593a]"
              />
              Visible to schools
            </label>

            <div className="flex gap-2">
              <Button onClick={save} disabled={!editing.name.trim() || editing.base_cost <= 0} full>
                Save item
              </Button>
              {(items ?? []).some((i) => i.id === editing.id) && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await remove('catalog_items', editing.id)
                    setEditing(null)
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
