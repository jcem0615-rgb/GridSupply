import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { getTaxConfig } from '../../lib/db/seed'
import { useAuth } from '../../store/auth'
import { peso, round2 } from '../../lib/money'
import { createPR, type DraftLine } from '../../lib/orders'
import { Button, Card, Empty, Field, Input, Select, Textarea, cx } from '../../components/ui'
import { Pager } from '../../components/Pager'
import { usePaged } from '../../lib/usePaged'
import { can } from '../../lib/permissions'
import type { CatalogItem } from '../../types'

const FUND_SOURCES = ['MOOE', 'School MOOE — Downloaded', 'Special Education Fund (SEF)', 'Canteen Fund', 'PTA Fund']

const STEPS = ['Details', 'Items', 'Review'] as const

export function PRWizard() {
  const profile = useAuth((s) => s.profile)!
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [purpose, setPurpose] = useState('')
  const [fundSource, setFundSource] = useState(FUND_SOURCES[0])
  const [supplierId, setSupplierId] = useState('')
  /* null = follow the supplier's own record; true/false = the school overrode it. */
  const [vatOverride, setVatOverride] = useState<boolean | null>(null)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [saving, setSaving] = useState(false)

  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => s.status === 'active').toArray(), [], [])
  const tax = useLiveQuery(() => getTaxConfig(), [])
  const catalog = useLiveQuery(
    async (): Promise<CatalogItem[]> =>
      supplierId ? db.catalog_items.where('supplier_id').equals(supplierId).toArray() : [],
    [supplierId],
    [] as CatalogItem[],
  )

  const term = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      (catalog ?? []).filter(
        (c) =>
          c.active &&
          (term === '' ||
            c.name.toLowerCase().includes(term) ||
            c.description.toLowerCase().includes(term)) &&
          (!selectedOnly || (qty[c.id] ?? 0) > 0),
      ),
    [catalog, term, selectedOnly, qty],
  )

  /* Quantities are keyed by item id, so a selection survives paging and
     searching — only the rendered window changes. */
  const paged = usePaged(visible, 10, `${term}|${selectedOnly}|${supplierId}`)

  const lines: DraftLine[] = useMemo(
    () =>
      (catalog ?? [])
        .filter((c) => (qty[c.id] ?? 0) > 0)
        .map((c) => ({
          catalog_item_id: c.id,
          name: c.name,
          description: c.description,
          unit: c.unit,
          qty: qty[c.id],
          unit_price: c.selling_price,
        })),
    [catalog, qty],
  )

  const total = round2(lines.reduce((s, l) => s + l.qty * l.unit_price, 0))

  const supplier = (suppliers ?? []).find((s) => s.id === supplierId)
  const vatRegistered = vatOverride ?? supplier?.vat_registered ?? true

  if (!can(profile.role, 'pr.create')) {
    return <Empty title="Not your step" hint="Only the Property Custodian or BAC can draft a Purchase Request." />
  }

  const canAdvance = step === 0 ? purpose.trim().length > 3 && !!supplierId : step === 1 ? lines.length > 0 : true

  const save = async () => {
    setSaving(true)
    const order = await createPR(profile, {
      supplier_id: supplierId,
      purpose,
      fund_source: fundSource,
      lines,
      supplier_vat_registered: vatRegistered,
    })
    setSaving(false)
    navigate(`/orders/${order.id}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">New Purchase Request</h1>
        <p className="text-sm text-ink-400">Saved on this device as you go — safe to fill in without signal.</p>
      </div>

      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                i <= step ? 'bg-brand text-white' : 'bg-ink-100 text-ink-400',
              )}
            >
              {i + 1}
            </span>
            <span className={cx('text-xs font-semibold', i <= step ? 'text-ink-900' : 'text-ink-400')}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-ink-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="Request details">
          <div className="space-y-4">
            <Field label="Purpose" hint="Written onto the printed PR — be specific enough for the auditor.">
              <Textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Supplies for the 2nd quarter examinations and classroom operations"
              />
            </Field>
            <Field label="Fund source">
              <Select value={fundSource} onChange={(e) => setFundSource(e.target.value)}>
                {FUND_SOURCES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier">
              <Select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value)
                  /* A new supplier brings its own status; drop any prior override. */
                  setVatOverride(null)
                }}
              >
                <option value="">Select a supplier…</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            {supplier && (
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Supplier's VAT status
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [true, 'VAT-registered', '12% VAT, 1% EWT, 5% final VAT'],
                    [false, 'Non-VAT', `1% EWT, ${((tax?.percentage_tax_rate ?? 0) * 100).toFixed(0)}% percentage tax`],
                  ].map(([value, label, hint]) => (
                    <button
                      key={String(value)}
                      onClick={() => setVatOverride(value as boolean)}
                      className={cx(
                        'rounded-xl border px-3 py-2.5 text-left transition',
                        vatRegistered === value
                          ? 'border-brand/50 bg-[rgba(180,89,58,0.12)]'
                          : 'border-[rgba(120,80,50,0.18)] hover:bg-[rgba(255,251,245,0.7)]',
                      )}
                    >
                      <span className="block text-sm font-bold text-ink-900">{label as string}</span>
                      <span className="block text-[11px] text-ink-400">{hint as string}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-400">
                  {vatOverride === null
                    ? `From ${supplier.name}'s registration on file. Change it if their BIR certificate says otherwise.`
                    : 'Overridden for this purchase — check against the supplier\'s BIR Certificate of Registration.'}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Items" subtitle={`${lines.length} selected · ${peso(total)}`}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the supplier's catalog…"
              className="min-w-48 flex-1"
            />
            <button
              onClick={() => setSelectedOnly((v) => !v)}
              disabled={lines.length === 0 && !selectedOnly}
              className={cx(
                'shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold transition disabled:opacity-40',
                selectedOnly ? 'bg-brand text-white' : 'border border-ink-200 text-ink-600 hover:bg-ink-50',
              )}
            >
              Selected ({lines.length})
            </button>
          </div>
          {visible.length === 0 ? (
            <Empty
              title={selectedOnly ? 'Nothing selected yet' : term ? 'No matching items' : 'No catalog items'}
              hint={
                selectedOnly
                  ? 'Add a quantity to an item and it will appear here.'
                  : term
                    ? 'Try a different search term.'
                    : 'This supplier has not published any active items yet.'
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {paged.rows.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{c.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      {peso(c.selling_price)} / {c.unit} · {c.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQty((q) => ({ ...q, [c.id]: Math.max(0, (q[c.id] ?? 0) - 1) }))}
                      className="h-8 w-8 rounded-lg border border-ink-200 text-sm font-bold text-ink-600"
                      aria-label={`Decrease ${c.name}`}
                    >
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      value={qty[c.id] ?? 0}
                      onChange={(e) =>
                        setQty((q) => ({ ...q, [c.id]: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) }))
                      }
                      className="h-8 w-12 rounded-lg border border-ink-200 text-center text-sm font-bold tabular-nums"
                      aria-label={`Quantity of ${c.name}`}
                    />
                    <button
                      onClick={() => setQty((q) => ({ ...q, [c.id]: (q[c.id] ?? 0) + 1 }))}
                      className="h-8 w-8 rounded-lg border border-ink-200 text-sm font-bold text-ink-600"
                      aria-label={`Increase ${c.name}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pager paged={paged} unit="items" />
        </Card>
      )}

      {step === 2 && (
        <Card title="Review" subtitle="This becomes PR document once submitted">
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase text-ink-400">Purpose</dt>
              <dd className="text-ink-900">{purpose}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-ink-400">Fund source</dt>
              <dd className="text-ink-900">{fundSource}</dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-400">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.name} className="border-b border-ink-100">
                    <td className="py-2 text-ink-900">{l.name}</td>
                    <td className="py-2 text-right tabular-nums">{l.qty} {l.unit}</td>
                    <td className="py-2 text-right tabular-nums">{peso(l.unit_price)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{peso(l.qty * l.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-3 text-right text-xs font-bold uppercase text-ink-400">
                    Total (VAT inclusive)
                  </td>
                  <td className="py-3 text-right text-base font-black tabular-nums text-ink-900">{peso(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < 2 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} full>
            Continue
          </Button>
        ) : (
          <Button onClick={save} disabled={saving || lines.length === 0} full>
            {saving ? 'Saving…' : 'Save draft PR'}
          </Button>
        )}
      </div>
    </div>
  )
}
