/**
 * Auth-surface checks: the reveal toggle, and that "Keep me signed in" moves
 * the session between localStorage and sessionStorage rather than only
 * toggling a checkbox.
 *
 * A browser restart is simulated by opening a fresh context seeded with only
 * the persistent origin storage — sessionStorage does not survive that, which
 * is exactly the behaviour under test.
 *
 *   npm run build && npm run preview &
 *   npm run auth-check
 */
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const b = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const errs = []
let failed = 0
const ok = (c, m) => { if (!c) failed++; console.log(c ? `✓ ${m}` : `✗ ${m}`) }

// --- show password ---
{
  const ctx = await b.newContext(); const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE + '/login'); await p.waitForSelector('text=Demo accounts')
  const field = p.locator('input[autocomplete="current-password"]')
  await field.fill('SuperSecret1')
  ok(await field.getAttribute('type') === 'password', 'password is masked by default')
  const toggle = p.getByRole('button', { name: 'Show password' })
  ok(await toggle.getAttribute('aria-pressed') === 'false', 'toggle reports aria-pressed=false')
  await toggle.click()
  ok(await field.getAttribute('type') === 'text', 'clicking reveals the password')
  ok(await field.inputValue() === 'SuperSecret1', 'value survives the reveal')
  ok(await p.getByRole('button', { name: 'Hide password' }).isVisible(), 'label flips to Hide password')
  ok(!/\/login\?/.test(p.url()), 'toggle did not submit the form')
  await p.getByRole('button', { name: 'Hide password' }).click()
  ok(await field.getAttribute('type') === 'password', 'clicking again re-masks it')
  await ctx.close()
}

const readStores = (p) => p.evaluate(() => ({
  local: localStorage.getItem('gridsupply-auth'),
  session: sessionStorage.getItem('gridsupply-auth'),
  flag: localStorage.getItem('gridsupply-remember'),
}))

// --- remember me OFF: session must not outlive the browser ---
{
  const ctx = await b.newContext(); const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE + '/login'); await p.waitForSelector('text=Demo accounts')
  await p.getByRole('checkbox').uncheck()
  await p.getByRole('button', { name: /Dr. Elena Villanueva/ }).click()
  await p.waitForURL(/school/)
  const s = await readStores(p)
  ok(s.session !== null, 'unchecked: session written to sessionStorage')
  ok(s.local === null, 'unchecked: nothing left in localStorage')
  ok(s.flag === '0', 'unchecked: preference recorded')
  await p.reload(); await p.waitForTimeout(900)
  ok(/\/school/.test(p.url()), 'unchecked: still signed in across a reload')
  const state = await ctx.storageState()
  await ctx.close()
  // A new context with only the *persistent* cookies/localStorage = browser restart.
  const fresh = await b.newContext({ storageState: { cookies: [], origins: state.origins ?? [] } })
  const q = await fresh.newPage()
  await q.goto(BASE + '/school'); await q.waitForTimeout(900)
  ok(/\/login/.test(q.url()), 'unchecked: browser restart lands back on login')
  await fresh.close()
}

// --- remember me ON: session persists across a restart ---
{
  const ctx = await b.newContext(); const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE + '/login'); await p.waitForSelector('text=Demo accounts')
  ok(await p.getByRole('checkbox').isChecked(), 'checked by default')
  await p.getByRole('button', { name: /Jose Cruz/ }).click()
  await p.waitForURL(/owner/)
  const s = await readStores(p)
  ok(s.local !== null, 'checked: session written to localStorage')
  ok(s.session === null, 'checked: nothing stranded in sessionStorage')
  const state = await ctx.storageState()
  await ctx.close()
  const fresh = await b.newContext({ storageState: { cookies: [], origins: state.origins ?? [] } })
  const q = await fresh.newPage()
  await q.goto(BASE + '/owner'); await q.waitForTimeout(900)
  ok(/\/owner/.test(q.url()), 'checked: still signed in after a browser restart')
  await fresh.close()
}

console.log('\nerrors:', errs.length ? errs.join('\n') : 'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
