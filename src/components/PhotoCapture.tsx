import { useRef, useState } from 'react'
import { fileToAttachment } from '../lib/attachments'
import type { Attachment } from '../types'
import { Button, cx } from './ui'

/**
 * `capture="environment"` is honoured on Android and on iOS Safari in a browser
 * tab, but is inconsistent for an installed iOS PWA — so the same input is also
 * exposed as a plain file picker, which always works.
 */
export function PhotoCapture({
  kind,
  value,
  onChange,
  label = 'Take photo',
  className,
}: {
  kind: Attachment['kind']
  value: Attachment | null
  onChange: (a: Attachment | null) => void
  label?: string
  className?: string
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      onChange(await fileToAttachment(file, kind))
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className={cx('space-y-3', className)}>
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-ink-200">
          <img src={value.data_url} alt={value.name} className="max-h-64 w-full bg-[rgba(255,251,245,0.6)] object-contain" />
          <button
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-lg bg-[rgba(255,251,245,0.92)] px-2.5 py-1 text-xs font-bold text-[#a13a33] shadow backdrop-blur"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => cameraRef.current?.click()} disabled={busy} full>
            {busy ? 'Processing…' : label}
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            Choose file
          </Button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handle} className="hidden" />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handle} className="hidden" />
    </div>
  )
}
