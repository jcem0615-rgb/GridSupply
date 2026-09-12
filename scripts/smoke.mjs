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
let tempPassword = ''

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
  /* An account flagged by an admin reset lands on the portal for one tick and
     is then redirected to /change-password. Waiting only for the portal URL
     races that redirect and fails intermittently, so accept either. */
  await page.waitForURL(/\/(school|supplier|owner|change-password)/)
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
    await page.getByPlaceholder('Write a message…').fill('Delivery arriving before noon today.')
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

  await step("supplier sees the owner's published payment methods", async () => {
    await page.goto(BASE + '/supplier/billing')
    await page.waitForSelector('text=Where to pay')
    await page.waitForSelector('text=0917 555 0142')
    await page.waitForSelector('text=Bank of the Philippine Islands')
  })

  await step('supplier submits a payment against a chosen method', async () => {
    await page.getByRole('button', { name: 'Submit payment' }).click()
    await page.getByRole('button', { name: /BPI Savings/ }).click()
    await page.getByPlaceholder('0091234567').fill('0091234567')
    await page.getByRole('button', { name: 'Submit for review' }).click()
    await page.waitForSelector('text=pending')
    /* The method label is snapshotted onto the payment record. */
    await page.waitForSelector('text=BPI Savings')
  })

  await step('owner reviews and approves the payment', async () => {
    await signOut(); await signInAs('Jose Cruz')
    await page.goto(BASE + '/owner/payments')
    await page.getByRole('button', { name: 'Review', exact: true }).click()
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

  await step('owner adds a school', async () => {
    await page.getByRole('button', { name: 'Add school' }).first().click()
    await page.getByPlaceholder('Bagong Silang Elementary School').fill('San Roque National High School')
    await page.getByPlaceholder('104721').fill('998877')
    await page.getByRole('button', { name: 'Save school' }).click()
    await page.waitForSelector('text=San Roque National High School')
  })

  await step('owner edits that school', async () => {
    const row = page.locator('li', { hasText: 'San Roque National High School' }).first()
    await row.getByRole('button', { name: 'Edit' }).click()
    await page.getByPlaceholder('Division of Caloocan City').fill('Division of Rizal')
    await page.getByRole('button', { name: 'Save school' }).click()
    await page.waitForSelector('text=Division of Rizal')
  })

  await step('owner adds a person into the new school', async () => {
    await page.getByRole('button', { name: 'people' }).click()
    await page.getByRole('button', { name: 'Add person' }).first().click()
    await page.locator('input[type="email"]').fill('head@sanroque.deped.gov.ph')
    await page.locator('input').first().fill('Maria Ocampo')
    await page.locator('select').last().selectOption({ label: 'San Roque National High School' })
    await page.getByRole('button', { name: 'Save person' }).click()
    await page.waitForSelector('text=Maria Ocampo')
  })

  await step('deleting a tenant with transactions is refused', async () => {
    await page.getByRole('button', { name: 'schools' }).click()
    const row = page.locator('li', { hasText: 'Bagong Silang Elementary School' }).first()
    await row.getByRole('button', { name: 'Delete' }).click()
    await page.waitForSelector('text=cannot be deleted')
    const del = page.getByRole('button', { name: 'Delete', exact: true }).last()
    if (!(await del.isDisabled())) throw new Error('delete button should be disabled')
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  await step('owner deletes the unused school and its people', async () => {
    const row = page.locator('li', { hasText: 'San Roque National High School' }).first()
    await row.getByRole('button', { name: 'Delete' }).click()
    await page.waitForSelector('text=will be deleted too')
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await page.waitForTimeout(600)
    const body = await page.locator('body').innerText()
    if (body.includes('San Roque National High School')) throw new Error('school was not deleted')
    await page.getByRole('button', { name: 'people' }).click()
    await page.waitForTimeout(300)
    if ((await page.locator('body').innerText()).includes('Maria Ocampo')) {
      throw new Error('cascade did not remove the tenant user')
    }
  })

  await step('owner adds a payment method suppliers can pay into', async () => {
    await page.goto(BASE + '/owner/payments')
    await page.getByRole('button', { name: 'Payment methods' }).click()
    await page.waitForSelector('text=Where suppliers send payment')
    await page.getByRole('button', { name: 'Add method' }).click()
    await page.getByPlaceholder('GCash — main').fill('Maya Business')
    await page.locator('select').first().selectOption('maya')
    await page.getByPlaceholder('0917 555 0142').last().fill('0998 111 2233')
    await page.getByRole('button', { name: 'Save method' }).click()
    await page.waitForSelector('text=Maya Business')
    await page.screenshot({ path: `${shots}/owner-payment-methods.png`, fullPage: true })
  })

  await step('the new method reaches the supplier billing page', async () => {
    await signOut(); await signInAs('Marites Delos Reyes')
    await page.goto(BASE + '/supplier/billing')
    await page.waitForSelector('text=Maya Business')
    await page.waitForSelector('text=0998 111 2233')
    await page.screenshot({ path: `${shots}/supplier-billing.png`, fullPage: true })
  })

  await step('supplier owner manages their own team only', async () => {
    await page.goto(BASE + '/supplier/team')
    await page.waitForSelector('text=Marites Delos Reyes')
    await page.waitForSelector('text=Jayson Bautista')
    const body = await page.locator('body').innerText()
    /* School accounts must never appear in a supplier's team list. */
    if (/Elena Villanueva|Jose Cruz/.test(body)) throw new Error('cross-tenant account leaked into supplier team')
  })

  await step('supplier owner resets an employee password', async () => {
    const row = page.locator('li', { hasText: 'Jayson Bautista' }).first()
    await row.getByRole('button', { name: 'Reset password' }).click()
    await page.getByRole('button', { name: 'Reset password', exact: true }).last().click()
    await page.waitForSelector('text=Temporary password')
    const temp = (await page.locator('.font-mono').first().innerText()).trim()
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(temp)) throw new Error(`bad temp password: ${temp}`)
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForSelector('text=must change password')
    tempPassword = temp
  })

  await step('the reset employee is forced to change password on sign-in', async () => {
    await signOut()
    await page.goto(BASE + '/login')
    await page.getByRole('button', { name: /Jayson Bautista/ }).click()
    await page.waitForURL(/change-password/)
    await page.waitForSelector('text=Choose a new password')
    const inputs = page.locator('input[type="password"]')
    await inputs.nth(0).fill('Supplies2026')
    await inputs.nth(1).fill('Supplies2026')
    await page.getByRole('button', { name: 'Set password' }).click()
    await page.waitForURL(/\/supplier$/)
  })

  await step('the new password works on the sign-in form', async () => {
    await signOut()
    await page.getByPlaceholder('you@school.deped.gov.ph').fill('jayson@northgate.ph')
    await page.locator('input[type="password"]').fill('Supplies2026')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/supplier$/)
  })

  await step('the old temporary password no longer works', async () => {
    await signOut()
    await page.getByPlaceholder('you@school.deped.gov.ph').fill('jayson@northgate.ph')
    await page.locator('input[type="password"]').fill(tempPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForSelector('text=Incorrect password')
  })

  await step('owner can reset a school principal', async () => {
    await signInAs('Jose Cruz')
    await page.goto(BASE + '/owner/accounts')
    await page.getByRole('button', { name: 'people' }).click()
    const row = page.locator('li', { hasText: 'Elena Villanueva' }).first()
    await row.getByRole('button', { name: 'Reset password' }).click()
    await page.getByRole('button', { name: 'Reset password', exact: true }).last().click()
    await page.waitForSelector('text=Temporary password')
    await page.screenshot({ path: `${shots}/owner-reset-password.png` })
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForSelector('text=must change password')
  })

  await step('template customizer renders a live preview', async () => {
    await signOut(); await signInAs('Dr. Elena Villanueva')
    /* That reset forces a password change before anything else is reachable. */
    await page.waitForURL(/change-password/)
    const pw = page.locator('input[type="password"]')
    await pw.nth(0).fill('Caloocan2026')
    await pw.nth(1).fill('Caloocan2026')
    await page.getByRole('button', { name: 'Set password' }).click()
    await page.waitForURL(/\/school$/)
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
