import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { put } from '../../lib/db/repo'
import { nowIso, uuid } from '../../lib/ids'
import { Button, Card, Field, Select, cx } from '../../components/ui'
import { PhotoCapture } from '../../components/PhotoCapture'
import type { Attachment, BrandingSettings } from '../../types'

/* Warm-leaning swatches so an uploaded brand colour sits in the palette. */
const ACCENTS = ['#b4593a', '#a8651f', '#8c5b3f', '#5f7740', '#9c4a4a', '#6b4e71']

export function BrandingPage() {
  const [scope, setScope] = useState<'platform' | 'school' | 'supplier'>('platform')
  const [scopeId, setScopeId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const schools = useLiveQuery(() => db.schools.toArray(), [], [])
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], [])
  const attachments = useLiveQuery(() => db.attachments.toArray(), [], [])

  const key = scope === 'platform' ? null : scopeId || null
  const settings = useLiveQuery(
    async () => (await db.branding.toArray()).find((b) => b.scope === scope && b.scope_id === key),
    [scope, key],
  )

  const logo = (attachments ?? []).find((a) => a.id === settings?.logo_attachment_id) ?? null
  const hero = (attachments ?? []).find((a) => a.id === settings?.hero_attachment_id) ?? null

  const save = async (patch: Partial<BrandingSettings>) => {
    setSaving(true)
    try {
      const row: BrandingSettings = {
        id: settings?.id ?? uuid(),
        scope,
        scope_id: key,
        logo_attachment_id: settings?.logo_attachment_id ?? null,
        hero_attachment_id: settings?.hero_attachment_id ?? null,
        accent: settings?.accent ?? ACCENTS[0],
        ...patch,
        updated_at: nowIso(),
      }
      await put('branding', row, settings ? 'update' : 'insert')
    } finally {
      setSaving(false)
    }
  }

  const setAttachment = (field: 'logo_attachment_id' | 'hero_attachment_id') => (a: Attachment | null) =>
    save({ [field]: a?.id ?? null } as Partial<BrandingSettings>)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">Branding</h1>
        <p className="text-sm text-ink-400">
          Images are downscaled in the browser before upload — a phone photo never goes to storage at full size.
        </p>
      </div>

      <Card title="Target">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Scope">
            <Select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as typeof scope)
                setScopeId('')
              }}
            >
              <option value="platform">Platform-wide</option>
              <option value="school">A school</option>
              <option value="supplier">A supplier</option>
            </Select>
          </Field>
          {scope !== 'platform' && (
            <Field label={scope === 'school' ? 'School' : 'Supplier'}>
              <Select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">Select…</option>
                {(scope === 'school' ? (schools ?? []) : (suppliers ?? [])).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      {(scope === 'platform' || scopeId) && (
        <>
          <Card title="Avatar / logo" subtitle="Used as the account icon and the seal on printed documents">
            <PhotoCapture kind="logo" value={logo} onChange={setAttachment('logo_attachment_id')} label="Upload logo" />
          </Card>

          <Card title="Hero header background" subtitle="Shown behind the portal header">
            <PhotoCapture kind="hero" value={hero} onChange={setAttachment('hero_attachment_id')} label="Upload hero image" />
          </Card>

          <Card title="Accent colour">
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => save({ accent: c })}
                  style={{ background: c }}
                  className={cx(
                    'h-10 w-10 rounded-full transition',
                    settings?.accent === c ? 'ring-2 ring-ink-900 ring-offset-2' : '',
                  )}
                  aria-label={`Accent ${c}`}
                />
              ))}
            </div>
          </Card>

          <Card title="Preview">
            <div className="overflow-hidden rounded-2xl border border-ink-100">
              <div
                className="relative flex h-28 items-end p-4"
                style={{
                  background: hero ? `url(${hero.data_url}) center/cover` : (settings?.accent ?? ACCENTS[0]),
                }}
              >
                <div className="absolute inset-0 bg-black/25" />
                <div className="relative flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl border-2 border-white/70 bg-white">
                    {logo ? (
                      <img src={logo.data_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-black text-ink-400">GS</div>
                    )}
                  </div>
                  <p className="text-sm font-black text-white drop-shadow">
                    {scope === 'platform'
                      ? 'GridSupply'
                      : (scope === 'school' ? schools : suppliers)?.find((x) => x.id === scopeId)?.name}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Button variant="secondary" disabled={saving} onClick={() => save({})}>
            {saving ? 'Saving…' : 'Save branding'}
          </Button>
        </>
      )}
    </div>
  )
}
