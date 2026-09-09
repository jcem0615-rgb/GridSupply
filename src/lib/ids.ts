export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const pad = (n: number, w = 4) => String(n).padStart(w, '0')

/** Document numbers follow DepEd practice: PREFIX-YYYY-MM-####. */
export function docNumber(prefix: string, seq: number, date = new Date()) {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1, 2)
  return `${prefix}-${y}-${m}-${pad(seq)}`
}

export const nowIso = () => new Date().toISOString()

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
