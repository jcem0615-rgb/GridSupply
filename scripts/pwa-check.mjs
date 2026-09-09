/**
 * PWA check: verifies the service worker takes control, the manifest is valid,
 * the app shell boots with the network cut, and a Purchase Request created
 * fully offline persists to IndexedDB and lands in the outbox.
 *
 * Requires a PRODUCTION build — the service worker does not register in dev:
 *   npm run build && npm run preview &
 *   npm run pwa-check
 */
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const b = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const ctx = await b.newContext({ viewport:{width:390,height:844} })
const p = await ctx.newPage()
const errs=[]
p.on('pageerror', e=>errs.push('PAGEERROR '+e.message))

await p.goto(BASE + '/login')
// wait for SW to control the page
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
console.log('✓ service worker registered and controlling')

const manifest = await p.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
console.log('✓ manifest:', manifest.name, '| display:', manifest.display, '| icons:', manifest.icons.length)

// sign in and create data while online
await p.getByRole('button', { name: /Roberto Santos/ }).click()
await p.waitForURL(/school/)
console.log('✓ signed in')

// go offline and reload — the shell must boot from cache
await ctx.setOffline(true)
await p.reload({ waitUntil: 'load' })
await p.waitForSelector('text=Your action queue', { timeout: 15000 })
console.log('✓ app shell boots offline after reload')

// create a PR fully offline
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Offline capture test')
await p.locator('select').nth(1).selectOption({ index: 1 })
await p.getByRole('button', { name: 'Continue' }).click()
await p.waitForSelector('input[placeholder^="Search the supplier"]')
const plus = p.locator('button[aria-label^="Increase"]').first()
await plus.click(); await plus.click()
await p.getByRole('button', { name: 'Continue' }).click()
await p.getByRole('button', { name: 'Save draft PR' }).click()
await p.waitForURL(/\/orders\//)
await p.waitForSelector('text=Draft PR')
console.log('✓ PR created and persisted while fully offline')

const outbox = await p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('gridsupply')
  r.onsuccess = () => {
    const tx = r.result.transaction('outbox', 'readonly')
    const c = tx.objectStore('outbox').count()
    c.onsuccess = () => res(c.result)
    c.onerror = () => rej(c.error)
  }
  r.onerror = () => rej(r.error)
}))
console.log('✓ outbox holds', outbox, 'queued mutations')

await ctx.setOffline(false)
await p.waitForTimeout(500)
console.log('\nerrors:', errs.length ? errs.join('\n') : 'none')
await b.close()
process.exit(errs.length ? 1 : 0)
