import { db } from './db/dexie'
import { isSupabaseConfigured, supabase } from './supabase'
import { nowIso } from './ids'

let running = false

/**
 * Drains the outbox into Supabase. Conflict rule (docs/06): the outbox entry
 * carries `client_uuid`, so an upsert on that column is idempotent — replaying
 * a half-synced batch updates the existing row instead of duplicating it.
 * Server state wins on any column the client did not touch.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine || running) {
    return { sent: 0, failed: 0 }
  }
  running = true
  let sent = 0
  let failed = 0
  try {
    const pending = await db.outbox.filter((e) => e.synced_at === null).sortBy('created_at')
    for (const entry of pending) {
      try {
        if (entry.op === 'delete') {
          const { error } = await supabase.from(entry.table).delete().eq('id', entry.payload.id)
          if (error) throw error
        } else {
          const onConflict = 'client_uuid' in entry.payload ? 'client_uuid' : 'id'
          const { error } = await supabase.from(entry.table).upsert(entry.payload, { onConflict })
          if (error) throw error
        }
        await db.outbox.update(entry.id!, { synced_at: nowIso(), last_error: null })
        sent++
      } catch (err) {
        failed++
        await db.outbox.update(entry.id!, {
          attempts: entry.attempts + 1,
          last_error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } finally {
    running = false
  }
  return { sent, failed }
}

let timer: number | undefined

export function startSyncLoop() {
  if (timer) return
  window.addEventListener('online', () => void flushOutbox())
  timer = window.setInterval(() => void flushOutbox(), 30_000)
  void flushOutbox()
}

export async function clearSyncedOutbox() {
  await db.outbox.filter((e) => e.synced_at !== null).delete()
}
