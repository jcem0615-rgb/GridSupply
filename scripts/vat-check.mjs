/**
 * VAT / non-VAT checks.
 *
 * Asserts the arithmetic of both branches against hand-computed figures, and
 * that the DV and the BIR 2307 swap the right lines and ATCs. The same gross
 * is run both ways so the difference is visible rather than merely plausible.
 *
 *   npm run build && npm run preview &
 *   npm run vat-check
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'vat-screenshots'
mkdirSync(O, { recursive: true })
let failed = 0
const b = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const p = await (await b.newContext({viewport:{width:1280,height:950}})).newPage()
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())})
const ok=(c,m)=>{ if(!c) failed++; console.log(c?`✓ ${m}`:`✗ ${m}`) }
const signIn=async(n,u)=>{await p.goto(BASE+'/login');await p.waitForSelector('text=Demo accounts');await p.getByRole('button',{name:n}).click();await p.waitForURL(u)}

const makePR = async (label, nonVat) => {
  await p.goto(BASE+'/school/new')
  await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill(label)
  await p.locator('select').nth(1).selectOption({index:1})
  await p.waitForSelector("text=Supplier's VAT status")
  if (nonVat) await p.getByRole('button',{name:/^Non-VAT/}).click()
  await p.getByRole('button',{name:'Continue'}).click()
  await p.waitForSelector('input[placeholder^="Search the supplier"]')
  // Whiteboard Marker @ 390.40 x 4 = 1561.60. Search first: the picker paginates.
  await p.locator('input[placeholder^="Search the supplier"]').fill('Whiteboard Marker')
  await p.waitForTimeout(400)
  const row = p.locator('li', { hasText: 'Whiteboard Marker' }).first()
  for (let i=0;i<4;i++) await row.locator('button[aria-label^="Increase"]').click()
  await p.getByRole('button',{name:'Continue'}).click()
  await p.getByRole('button',{name:'Save draft PR'}).click()
  await p.waitForURL(/\/orders\//)
  return p.url()
}

await signIn(/Dr. Elena Villanueva/, /school/)

// Default follows the supplier record (seeded VAT-registered).
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('x')
await p.locator('select').nth(1).selectOption({index:1})
await p.waitForSelector("text=Supplier's VAT status")
ok((await p.locator('body').innerText()).includes("registration on file"), 'wizard defaults from the supplier record')
await p.screenshot({path:`${O}/wizard.png`})

const vatUrl = await makePR('VAT supplier order', false)
await p.waitForTimeout(500)
let body = await p.locator('body').innerText()
ok(body.includes('VAT-registered supplier'), 'VAT order labelled VAT-registered')
ok(body.includes('₱1,394.29'), `VAT: net of VAT 1,394.29 (${body.match(/Net of VAT\s*₱[\d,.]+/)?.[0]})`)
ok(body.includes('−₱13.94'), 'VAT: EWT 1% of the net-of-VAT base')
ok(body.includes('−₱69.71'), 'VAT: final VAT 5% withheld')
ok(body.includes('₱1,477.95'), 'VAT: net payable 1,477.95')

const nonVatUrl = await makePR('Non-VAT supplier order', true)
await p.waitForTimeout(500)
body = await p.locator('body').innerText()
ok(body.includes('non-VAT supplier'), 'non-VAT order labelled non-VAT')
ok(!body.includes('Net of VAT'), 'non-VAT: no VAT breakdown shown')
ok(body.includes('−₱15.62'), 'non-VAT: EWT 1% computed on the gross')
ok(body.includes('Percentage tax 3% (WB080)'), 'non-VAT: percentage tax line with its ATC')
ok(body.includes('−₱46.85'), 'non-VAT: percentage tax 3%')
ok(body.includes('₱1,499.13'), 'non-VAT: net payable 1,499.13')
await p.screenshot({path:`${O}/summary-nonvat.png`})

// Drive it to a DV so the printed documents can be checked.
await p.goto(nonVatUrl)
await p.getByRole('button',{name:'Submit for approval'}).click(); await p.waitForSelector('text=Awaiting Approval')
await p.getByRole('button',{name:'Approve request'}).click(); await p.waitForSelector('text=PR Approved')
await p.getByRole('button',{name:'Issue Purchase Order'}).click(); await p.waitForSelector('text=PO Issued')
await p.getByRole('button',{name:'Sign out'}).click(); await p.waitForURL(/login/)
await signIn(/Marites Delos Reyes/, /supplier/)
await p.goto(nonVatUrl)
await p.getByRole('button',{name:'Accept order'}).click(); await p.waitForSelector('text=PO Accepted')
await p.getByRole('button',{name:'Mark as dispatched'}).click()
await p.getByRole('button',{name:'Mark dispatched'}).click(); await p.waitForSelector('text=In Transit')
await p.getByRole('button',{name:'Sign out'}).click(); await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(nonVatUrl)
await p.getByRole('button',{name:'Receive & sign IAR'}).click()
await p.getByPlaceholder('Dr. Elena Villanueva').fill('Dr. Elena Villanueva')
await p.getByRole('button',{name:'Sign IAR & accept delivery'}).click(); await p.waitForSelector('text=Delivered / IAR Signed')
ok((await p.locator('body').innerText()).includes('Non-VAT'), 'status still switchable before the DV')
await p.getByRole('button',{name:'Generate Disbursement Voucher'}).click(); await p.waitForSelector('text=DV Issued')
await p.waitForTimeout(400)
ok((await p.locator('body').innerText()).includes('locked once the Disbursement Voucher'), 'status locks after the DV')

await p.getByRole('button',{name:'Documents'}).click()
await p.getByRole('button',{name:'Disbursement Voucher'}).click(); await p.waitForTimeout(400)
const dv = await p.locator('article').innerText()
ok(dv.includes('non-VAT supplier'), 'DV says non-VAT supplier')
ok(!dv.includes('Final VAT withheld'), 'DV omits the 5% final VAT line')
ok(dv.includes('Percentage tax withheld (3% · WB080)'), 'DV shows percentage tax withheld')
await p.screenshot({path:`${O}/dv-nonvat.png`, fullPage:true})

await p.getByRole('button',{name:'Summary'}).click(); await p.waitForTimeout(300)
await p.getByRole('button',{name:'Record cheque payment'}).click()
await p.getByPlaceholder('0012345').fill('0099001')
await p.getByRole('button',{name:'Record payment'}).click(); await p.waitForSelector('text=released')
await p.getByRole('button',{name:'Documents'}).click()
await p.getByRole('button',{name:'BIR Form 2307'}).click(); await p.waitForTimeout(400)
const f2307 = await p.locator('article').innerText()
ok(f2307.includes('WB080'), '2307 uses the percentage-tax ATC')
ok(!f2307.includes('WV010'), '2307 omits the final-VAT ATC')
await p.screenshot({path:`${O}/2307-nonvat.png`, fullPage:true})

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
