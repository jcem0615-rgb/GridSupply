import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/dexie'
import { flushOutbox } from '../lib/sync'
import { isSupabaseConfigured } from '../lib/supabase'

export function OfflineBar() {
  const [online, setOnline] = useState(navigator.onLine)
  const [flushing, setFlushing] = useState(false)

  const pending = useLiveQuery(() => db.outbox.filter((e) => e.synced_at === null).count(), [], 0)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  /* With no backend wired there is nothing to sync to, so a standing
     "queued" banner would be noise — the offline notice still shows. */
  const showPending = pending > 0 && isSupabaseConfigured
  if (online && !showPending) return null

  return (
    <div
      className={`no-print px-4 py-2 text-center text-xs font-semibold ${
        online ? 'bg-amber-100 text-amber-900' : 'bg-ink-800 text-white'
      }`}
    >
      {!online && <>Offline — work is saved on this device and will sync automatically. </>}
      {showPending && (
        <>
          {pending} change{pending === 1 ? '' : 's'} queued
          {online && (
            <button
              onClick={async () => {
                setFlushing(true)
                await flushOutbox()
                setFlushing(false)
              }}
              disabled={flushing}
              className="ml-2 underline underline-offset-2"
            >
              {flushing ? 'syncing…' : 'sync now'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
