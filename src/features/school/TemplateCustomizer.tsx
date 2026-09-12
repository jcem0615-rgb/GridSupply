import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { put } from '../../lib/db/repo'
import { nowIso, uuid } from '../../lib/ids'
import { can } from '../../lib/permissions'
import { Button, Card, Empty, Field, Input, cx } from '../../components/ui'
import { PhotoCapture } from '../../components/PhotoCapture'
import { PrintDoc, DOC_TITLE } from '../print/PrintDocs'
import { getTaxConfig } from '../../lib/db/seed'
import type { Order, OrderLine, PrintTemplate } from '../../types'

const DOC_TYPES: PrintTemplate['doc_type'][] = ['PR', 'PO', 'IAR', 'DV', 'BIR2307']

const defaults = (schoolId: string, docType: PrintTemplate['doc_type'], headerLines: string[]): PrintTemplate => ({
  id: uuid(),
  school_id: schoolId,
  doc_type: docType,
  header_left_attachment_id: null,
  header_right_attachment_id: null,
  header_lines: headerLines,
  footer_note: '',
  show_seal: true,
  signatories: [
    { label: 'Requested by', name: '', title: 'Property Custodian' },
    { label: 'Approved by', name: '', title: 'School Principal' },
  ],
  updated_at: nowIso(),
})

/** A specimen order so the customizer previews a realistic sheet. */
function specimen(schoolId: string): { order: Order; lines: OrderLine[] } {
  const id = 'preview'
  const order: Order = {
    id,
    client_uuid: id,
    school_id: schoolId,
    supplier_id: null,
    status: 'paid',
    pr_number: 'PR-2026-09-0007',
    po_number: 'PO-2026-09-0007',
    dv_number: 'DV-2026-09-0007',
    iar_number: 'IAR-2026-09-0007',
    purpose: 'Supplies for the 2nd quarter examinations',
    fund_source: 'MOOE',
    gross_total: 12_460,
    requested_by: null,
    approved_by: null,
    approved_at: nowIso(),
    rejection_reason: null,
    po_issued_at: nowIso(),
    accepted_at: nowIso(),
    dispatched_at: nowIso(),
    delivered_at: nowIso(),
    received_by: null,
    iar_signature: 'Roberto Santos',
    dv_issued_at: nowIso(),
    paid_at: nowIso(),
    check_number: '0012345',
    check_photo_id: null,
    bir_2307_issued: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  const lines: OrderLine[] = [
    { id: 'l1', order_id: id, catalog_item_id: null, name: 'Bond Paper A4', description: 'Substance 20', unit: 'ream', qty: 30, unit_price: 247.8, line_total: 7434 },
    { id: 'l2', order_id: id, catalog_item_id: null, name: 'Whiteboard Marker', description: 'Box of 12', unit: 'box', qty: 8, unit_price: 390.4, line_total: 3123.2 },
    { id: 'l3', order_id: id, catalog_item_id: null, name: 'Chalk, Dustless', description: '100 pcs', unit: 'box', qty: 11, unit_price: 174, line_total: 1914 },
  ]
  return { order, lines }
}

export function TemplateCustomizer() {
  const profile = useAuth((s) => s.profile)!
  const [docType, setDocType] = useState<PrintTemplate['doc_type']>('PR')
  const [draft, setDraft] = useState<PrintTemplate | null>(null)
  const [saved, setSaved] = useState(false)

  const school = useLiveQuery(() => db.schools.get(profile.school_id!), [profile.school_id])
  const stored = useLiveQuery(
    async () => (await db.print_templates.where('school_id').equals(profile.school_id!).toArray()).find((t) => t.doc_type === docType),
    [profile.school_id, docType],
  )
  const tax = useLiveQuery(() => getTaxConfig(), [])
  const attachments = useLiveQuery(() => db.attachments.toArray(), [], [])

  useEffect(() => {
    if (!school) return
    setDraft(
      stored ??
        defaults(school.id, docType, [
          'Republic of the Philippines',
          'Department of Education',
          school.division,
          school.district,
        ]),
    )
  }, [stored?.id, docType, school?.id])

  if (!can(profile.role, 'template.customize')) {
    return <Empty title="Not available for your role" hint="The Principal or Property Custodian maintains print templates." />
  }
  if (!school || !draft || !tax) return <Empty title="Loading…" />

  const seal = (attachments ?? []).find((a) => a.id === draft.header_left_attachment_id) ?? null
  const { order, lines } = specimen(school.id)

  const patch = (p: Partial<PrintTemplate>) => setDraft({ ...draft, ...p, updated_at: nowIso() })

  const save = async () => {
    await put('print_templates', draft, stored ? 'update' : 'insert')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="no-print">
        <h1 className="text-xl font-black tracking-tight text-ink-900">Print templates</h1>
        <p className="text-sm text-ink-400">Customise the letterhead and signatories on each printed document.</p>
      </div>

      <div className="no-print flex flex-wrap gap-2">
        {DOC_TYPES.map((d) => (
          <button
            key={d}
            onClick={() => setDocType(d)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              docType === d
                ? 'bg-gradient-to-b from-[#c2643f] to-[#a24e33] text-white shadow-[0_6px_16px_-8px_rgba(140,66,38,0.8)]'
                : 'glass-quiet text-ink-600',
            )}
          >
            {DOC_TITLE[d]}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="no-print space-y-5">
          <Card title="Letterhead">
            <div className="space-y-3">
              {draft.header_lines.map((line, i) => (
                <Input
                  key={i}
                  value={line}
                  onChange={(e) => {
                    const next = [...draft.header_lines]
                    next[i] = e.target.value
                    patch({ header_lines: next })
                  }}
                  placeholder={`Header line ${i + 1}`}
                />
              ))}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => patch({ header_lines: [...draft.header_lines, ''] })}>
                  Add line
                </Button>
                {draft.header_lines.length > 1 && (
                  <Button variant="ghost" onClick={() => patch({ header_lines: draft.header_lines.slice(0, -1) })}>
                    Remove last
                  </Button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.show_seal}
                  onChange={(e) => patch({ show_seal: e.target.checked })}
                  className="h-4 w-4 accent-[#b4593a]"
                />
                Show the school seal
              </label>
            </div>
          </Card>

          <Card title="Seal / logo">
            <PhotoCapture
              kind="logo"
              value={seal}
              onChange={(a) => patch({ header_left_attachment_id: a?.id ?? null })}
              label="Upload seal"
            />
          </Card>

          <Card title="Signatories">
            <div className="space-y-4">
              {draft.signatories.map((s, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-ink-100 p-3">
                  <Field label="Block label">
                    <Input
                      value={s.label}
                      onChange={(e) => {
                        const next = [...draft.signatories]
                        next[i] = { ...s, label: e.target.value }
                        patch({ signatories: next })
                      }}
                    />
                  </Field>
                  <Field label="Name">
                    <Input
                      value={s.name}
                      onChange={(e) => {
                        const next = [...draft.signatories]
                        next[i] = { ...s, name: e.target.value }
                        patch({ signatories: next })
                      }}
                      placeholder="Leave blank for a ruled signature line"
                    />
                  </Field>
                  <Field label="Position">
                    <Input
                      value={s.title}
                      onChange={(e) => {
                        const next = [...draft.signatories]
                        next[i] = { ...s, title: e.target.value }
                        patch({ signatories: next })
                      }}
                    />
                  </Field>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => patch({ signatories: [...draft.signatories, { label: 'Noted by', name: '', title: '' }] })}
                >
                  Add signatory
                </Button>
                {draft.signatories.length > 1 && (
                  <Button variant="ghost" onClick={() => patch({ signatories: draft.signatories.slice(0, -1) })}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card title="Footer note">
            <Input
              value={draft.footer_note}
              onChange={(e) => patch({ footer_note: e.target.value })}
              placeholder="This document is system-generated by GridSupply."
            />
          </Card>

          <div className="flex gap-2">
            <Button onClick={save} full>
              {saved ? 'Saved ✓' : 'Save template'}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print preview
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <PrintDoc
            type={docType}
            order={order}
            lines={lines}
            school={school}
            supplier={null}
            tax={tax}
            template={draft}
            logo={seal}
          />
        </div>
      </div>
    </div>
  )
}
