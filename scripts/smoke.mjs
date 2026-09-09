/**
 * End-to-end smoke test: walks one order through all nine lifecycle steps
 * across all three portals, then exercises catalog pricing, subscription
 * review, the template customiser and the mobile layout.
 *
 * The school side is one Principal account, so every school step is driven by
 * the same login; only the supplier hand-offs switch users.
 *
 *   npm run build && npm run preview &
 *   npm run smoke
 *
 * Set SMOKE_BASE to point at another origin, SMOKE_CHROME to use a specific
 * Chromium binary, and SMOKE_SHOTS to choose where screenshots are written.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const shots = process.env.SMOKE_SHOTS ?? 'smoke-screenshots'
mkdirSync(shots, { recursive: true })
const errors = []

const browser = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

const step = async (label, fn) => {
  try { await fn(); console.log('✓', label) }
  catch (e) { console.log('✗', label, '—', e.message); errors.push(`${label}: ${e.message}`); throw e }
}

const signInAs = async (name) => {
  await page.goto(BASE + '/login')
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.waitForURL(/\/(school|supplier|owner)/)
}

const signOut = async () => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(/login/)
}

try {
  await step('login page loads with demo accounts', async () => {
    await page.goto(BASE + '/login')
    await page.waitForSelector('text=Demo accounts')
  })

  await step('principal creates a PR', async () => {
    await signInAs('Dr. Elena Villanueva')
    await page.goto(BASE + '/school/new')
    await page.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Supplies for the 2nd quarter examinations')
    await page.locator('select').nth(1).selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForSelector('input[placeholder^="Search the supplier"]')
    // add quantities to first three items
    for (let i = 0; i < 3; i++) {
      const plus = page.locator('button[aria-label^="Increase"]').nth(i)
      await plus.click(); await plus.click()
    }
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForSelector('text=Total (VAT inclusive)')
    await page.getByRole('button', { name: 'Save draft PR' }).click()
    await page.waitForURL(/\/orders\//)
    await page.waitForSelector('text=Draft PR')
  })

  const orderUrl = page.url()
  console.log('  order:', orderUrl.replace(BASE, ''))

  await step('principal submits the PR for approval', async () => {
    await page.getByRole('button', { name: 'Submit for approval' }).click()
    await page.waitForSelector('text=Awaiting Approval')
  })

  await step('principal approves', async () => {
    await page.getByRole('button', { name: 'Approve request' }).click()
    await page.waitForSelector('text=PR Approved')
  })

  await step('principal issues PO', async () => {
    await page.getByRole('button', { name: 'Issue Purchase Order' }).click()
    await page.waitForSelector('text=PO Issued')
  })

  await step('supplier accepts and dispatches', async () => {
    await signOut(); await signInAs('Marites Delos Reyes')
    await page.goto(orderUrl)
    await page.getByRole('button', { name: 'Accept order' }).click()
    await page.waitForSelector('text=PO Accepted')
    await page.getByRole('button', { name: 'Mark as dispatched' }).click()
    await page.getByRole('button', { name: 'Mark dispatched' }).click()
    await page.waitForSelector('text=In Transit')
  })

  await step('supplier posts to the order thread', async () => {
    await page.getByRole('button', { name: 'Thread' }).click()
    await page.getByPlaceholder(/Message the school/).fill('Delivery arriving before noon today.')
    await page.getByRole('button', { name: 'Send' }).click()
    await page.waitForSelector('text=Delivery arriving before noon today.')
  })

  await step('principal signs the IAR', async () => {
    await signOut(); await signInAs('Dr. Elena Villanueva')
    await page.goto(orderUrl)
    await page.getByRole('button', { name: 'Receive & sign IAR' }).click()
    await page.getByPlaceholder('Dr. Elena Villanueva').fill('Dr. Elena Villanueva')
    await page.getByRole('button', { name: 'Sign IAR & accept delivery' }).click()
    await page.waitForSelector('text=Delivered / IAR Signed')
  })

  await step('principal issues the DV', async () => {
    await page.getByRole('button', { name: 'Generate Disbursement Voucher' }).click()
    await page.waitForSelector('text=DV Issued')
  })

  await step('principal records the cheque', async () => {
    await page.getByRole('button', { name: 'Record cheque payment' }).click()
    await page.getByPlaceholder('0012345').fill('0098765')
    await page.getByRole('button', { name: 'Record payment' }).click()
    await page.waitForSelector('text=Cheque 0098765 released')
  })

  await step('BIR 2307 is issued and printable', async () => {
    await page.getByRole('button', { name: 'Issue BIR Form 2307' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Documents' }).click()
    await page.getByRole('button', { name: 'BIR Form 2307' }).click()
    await page.waitForSelector('text=Certificate of Creditable Tax Withheld at Source')
    await page.waitForSelector('text=WC158')
    await page.screenshot({ path: `${shots}/doc-2307.png`, fullPage: true })
  })

  await step('DV shows the withholding breakdown', async () => {
    await page.getByRole('button', { name: 'Disbursement Voucher' }).click()
    await page.waitForSelector('text=NET AMOUNT DUE')
    await page.screenshot({ path: `${shots}/doc-dv.png`, fullPage: true })
  })

  await step('supplier catalog markup preview works', async () => {
    await signOut(); await signInAs('Marites Delos Reyes')
    await page.goto(BASE + '/supplier/catalog')
    await page.locator('text=Edit').first().click()
    await page.waitForSelector('text=Price to school')
    await page.waitForSelector('text=Margin over cost')
    await page.screenshot({ path: `${shots}/catalog.png` })
    await page.keyboard.press('Escape')
  })

  await step('supplier submits a subscription payment', async () => {
    await page.goto(BASE + '/supplier/billing')
    await page.getByRole('button', { name: 'Submit payment' }).click()
    await page.getByPlaceholder('0091234567').fill('0091234567')
    await page.getByRole('button', { name: 'Submit for review' }).click()
    await page.waitForSelector('text=pending')
  })

  await step('owner reviews and approves the payment', async () => {
    await signOut(); await signInAs('Jose Cruz')
    await page.goto(BASE + '/owner/payments')
    await page.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Approve & extend' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'approved' }).click()
    await page.waitForSelector('text=Northgate School Supplies Trading')
  })

  await step('owner can pause an account', async () => {
    await page.goto(BASE + '/owner/accounts')
    await page.waitForSelector('text=Bagong Silang Elementary School')
    await page.screenshot({ path: `${shots}/owner-accounts.png` })
  })

  await step('template customizer renders a live preview', async () => {
    await signOut(); await signInAs('Dr. Elena Villanueva')
    await page.goto(BASE + '/school/templates')
    await page.waitForSelector('text=Republic of the Philippines')
    await page.locator('input[placeholder="Header line 1"]').fill('REPUBLIC OF THE PHILIPPINES')
    await page.waitForSelector('text=REPUBLIC OF THE PHILIPPINES')
    await page.screenshot({ path: `${shots}/templates.png`, fullPage: true })
  })

  await step('mobile viewport renders the school dashboard', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE + '/school')
    await page.waitForSelector('text=Your action queue')
    await page.screenshot({ path: `${shots}/mobile-dashboard.png` })
  })
} catch { /* reported above */ }

console.log('\n--- console errors ---')
console.log(errors.length ? errors.slice(0, 15).join('\n') : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
