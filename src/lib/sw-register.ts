import { flushOutbox } from './sync'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  /* The Background Sync event fires in the worker, which has no Dexie handle —
     it messages open clients, and the flush happens here. */
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FLUSH_OUTBOX') void flushOutbox()
  })

  if (!import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* Registration failures must never break the app shell. */
    })
  })
}
