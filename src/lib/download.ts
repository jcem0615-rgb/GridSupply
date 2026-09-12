import type { Attachment } from '../types'

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

/**
 * Attachments are held as data URLs in IndexedDB. Browsers cap or outright
 * refuse a download whose href is a large data URL, so convert to a Blob and
 * hand the anchor an object URL instead.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'

  if (!header.includes(';base64')) {
    return new Blob([decodeURIComponent(body)], { type: mime })
  }
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Strips anything a filesystem would object to, and collapses runs of dashes. */
export function safeFilename(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function downloadAttachment(attachment: Attachment, baseName: string) {
  const blob = dataUrlToBlob(attachment.data_url)
  const ext = EXT[attachment.mime] ?? attachment.name.split('.').pop() ?? 'jpg'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFilename(baseName)}.${ext}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  /* Revoking immediately can cancel the download in some browsers. */
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
