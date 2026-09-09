import { db } from './db/dexie'
import { enqueue } from './db/repo'
import { nowIso, uuid } from './ids'
import type { Attachment } from '../types'

/**
 * Downscale on the client before storing. Field photos off a phone camera are
 * 4-8MB; IndexedDB and the eventual Storage upload both do better with ~1600px.
 */
export async function fileToAttachment(
  file: File,
  kind: Attachment['kind'],
  maxEdge = 1600,
): Promise<Attachment> {
  const dataUrl = file.type.startsWith('image/')
    ? await downscaleImage(file, maxEdge)
    : await readAsDataUrl(file)

  const attachment: Attachment = {
    id: uuid(),
    kind,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    data_url: dataUrl,
    created_at: nowIso(),
  }
  await db.attachments.put(attachment)
  await enqueue('attachments', 'insert', attachment as unknown as Record<string, unknown>, attachment.id)
  return attachment
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function downscaleImage(file: File, maxEdge: number, quality = 0.82): Promise<string> {
  const src = await readAsDataUrl(file)
  try {
    const img = await loadImage(src)
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
    if (scale === 1 && file.size < 900_000) return src
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return src
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    /* Decoding can fail on exotic formats — keep the original rather than losing the capture. */
    return src
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
