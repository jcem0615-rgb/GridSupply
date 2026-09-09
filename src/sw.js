/**
 * GridSupply service worker — hand-written, no Workbox.
 *
 * Strategy:
 *   - App shell (navigations, JS/CSS): stale-while-revalidate against a
 *     versioned cache, with a cached shell fallback so a cold offline launch
 *     still boots.
 *   - Supabase REST/Realtime: never cached — the Dexie outbox owns writes and
 *     serving a stale API response would silently show old approvals.
 *   - Background Sync: a 'gridsupply-outbox' tag wakes any open client to
 *     flush the outbox; if no client is open, the next launch flushes.
 */
/* Injected at build time by the serviceWorker() plugin in vite.config.ts —
   the hashed JS/CSS of this exact build, so a cold offline launch has every
   file it needs rather than only the HTML. */
const PRECACHE = self.__PRECACHE__ || []
const VERSION = self.__BUILD_ID__ || 'dev'
const SHELL_CACHE = `gridsupply-shell-${VERSION}`
const ASSET_CACHE = `gridsupply-assets-${VERSION}`
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', ...PRECACHE]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      /* addAll is atomic — one 404 would discard the whole precache, so each
         URL is added independently and a missing optional asset is tolerated. */
      .then((cache) => Promise.all(SHELL_URLS.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

const isApi = (url) =>
  url.pathname.startsWith('/rest/v1') ||
  url.pathname.startsWith('/auth/v1') ||
  url.pathname.startsWith('/storage/v1') ||
  url.pathname.startsWith('/realtime/v1')

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (isApi(url)) return
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy))
          return response
        })
        .catch(() =>
          caches
            .match('/index.html', { ignoreVary: true })
            .then((r) => r || caches.match('/', { ignoreVary: true }))
            .then((r) => r || new Response('Offline', { status: 503, statusText: 'Offline' })),
        ),
    )
    return
  }

  /* ignoreVary matters: the dev/preview server sends `Vary: Origin` on assets,
     and a precached entry stored without an Origin header would otherwise never
     match the CORS request a module script makes — the cache would look full
     and still miss on every offline load. */
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(ASSET_CACHE).then((c) => c.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return (
        cached ||
        network.then((r) => r || new Response('', { status: 504, statusText: 'Offline' }))
      )
    }),
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag !== 'gridsupply-outbox') return
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'FLUSH_OUTBOX' }))
    }),
  )
})

/** Web Push, delivered by a Supabase Edge Function (docs/07). */
self.addEventListener('push', (event) => {
  let payload = { title: 'GridSupply', body: 'You have a new update.', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    if (event.data) payload.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
      tag: payload.tag || 'gridsupply',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => 'focus' in c)
      if (open) {
        open.focus()
        open.navigate(target)
        return
      }
      return self.clients.openWindow(target)
    }),
  )
})
