import { db } from './dexie'
import { nowIso, uuid } from '../ids'
import type { OutboxOp } from '../../types'

/**
 * Records a mutation in the outbox. `client_uuid` is the idempotency key —
 * a replayed entry after a flaky sync must not create a second row server-side.
 */
export async function enqueue(
  table: string,
  op: OutboxOp,
  payload: Record<string, unknown>,
  clientUuid?: string,
) {
  await db.outbox.add({
    client_uuid: clientUuid ?? (payload.client_uuid as string) ?? (payload.id as string) ?? uuid(),
    table,
    op,
    payload,
    created_at: nowIso(),
    attempts: 0,
    last_error: null,
    synced_at: null,
  })
  requestSync()
}

/** Ask the service worker to flush when connectivity returns. */
export function requestSync() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(t: string): Promise<void> } }).sync?.register('gridsupply-outbox'))
    .catch(() => {
      /* Background Sync unsupported (Safari) — the interval flush in sync.ts covers it. */
    })
}

export async function put<T extends { id: string }>(
  table: string,
  row: T,
  op: OutboxOp = 'insert',
) {
  await (db as never as Record<string, { put(v: T): Promise<unknown> }>)[table].put(row)
  await enqueue(table, op, row as unknown as Record<string, unknown>)
  return row
}

export async function remove(table: string, id: string) {
  await (db as never as Record<string, { delete(id: string): Promise<void> }>)[table].delete(id)
  await enqueue(table, 'delete', { id }, id)
}

export async function pendingCount() {
  return db.outbox.filter((e) => e.synced_at === null).count()
}
