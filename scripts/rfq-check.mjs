/**
 * Request for Quotation.
 *
 * The assertion that matters most is that the price columns print blank — the
 * whole point of an RFQ is to ask the supplier for a price, so printing the
 * catalogue price the platform already holds would defeat it.
 *
 *   npm run build && npm run preview &
 *   npm run rfq-check
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'rfq-screenshots'
mkdirSync(O, { recursive: true })
let failed = 0
const b = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const p = await (await b.newContext({viewport:{width:1280,height:1000}})).newPage()
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())})
const ok=(c,m)=>{ if(!c) failed++; console.log(c?`✓ ${m}`:`✗ ${m}`) }
const signIn=async(n,u)=>{await p.goto(BASE+'/login');await p.waitForSelector('text=Demo accounts');await p.getByRole('button',{name:n}).click();await p.waitForURL(u)}

await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Quotation for quarterly supplies')
await p.locator('select').nth(1).selectOption({index:1})
await p.getByRole('button',{name:'Continue'}).click()
await p.waitForSelector('input[placeholder^="Search the supplier"]')
await p.locator('input[placeholder^="Search the supplier"]').fill('Bond Paper A4')
await p.waitForTimeout(400)
const row = p.locator('li', { hasText: 'Bond Paper A4' }).first()
for (let i=0;i<3;i++) await row.locator('button[aria-label^="Increase"]').click()
await p.getByRole('button',{name:'Continue'}).click()
await p.getByRole('button',{name:'Save draft PR'}).click(); await p.waitForURL(/\/orders\//)

// Not offered before approval — you cannot solicit quotes on an unapproved request.
await p.getByRole('button',{name:'Documents'}).click(); await p.waitForTimeout(500)
ok((await p.locator('button', { hasText: 'Request for Quotation' }).count())===0,
   'RFQ not offered on a draft request')

await p.getByRole('button',{name:'Summary'}).click()
await p.getByRole('button',{name:'Submit for approval'}).click(); await p.waitForSelector('text=Awaiting Approval')
await p.getByRole('button',{name:'Approve request'}).click(); await p.waitForSelector('text=PR Approved')

await p.getByRole('button',{name:'Documents'}).click(); await p.waitForTimeout(500)
ok((await p.locator('button', { hasText: 'Request for Quotation' }).count())>0, 'RFQ appears once approved')
await p.getByRole('button',{name:'Request for Quotation'}).click(); await p.waitForTimeout(500)

const doc = await p.locator('article').innerText()
ok(doc.includes('REQUEST FOR QUOTATION'), 'renders with the right title')
ok(/RFQ-\d{4}-\d{2}-\d{4}/.test(doc), `numbered from the PR (${doc.match(/RFQ-[\d-]+/)?.[0]})`)
ok(doc.includes('Northgate School Supplies Trading'), 'addressed to the supplier')
ok(doc.includes('007-889-221-00000'), "carries the supplier's TIN")
ok(doc.includes('lowest price'), 'carries the solicitation wording')
/* innerText applies CSS text-transform, so these headings read uppercase. */
ok(/terms and conditions/i.test(doc), 'carries terms and conditions')
ok(/supplier's quotation/i.test(doc), 'has a block for the supplier to sign')
ok(/lowest quotation meeting the specifications/i.test(doc), 'states the award rule')
ok(/thirty \(30\) calendar days/i.test(doc), 'states price validity')

// The whole point: prices are left for the supplier to fill in.
const priceCells = await p.locator('article table tbody tr').first().locator('td').allInnerTexts()
ok(!priceCells.join('|').includes('247.80'), `price columns left blank (${JSON.stringify(priceCells)})`)
/* Unit and quantity are separate columns on a printed document. */
ok(priceCells.includes('Ream'), 'unit column spells the unit out')
ok(priceCells.includes('3'), 'quantity column carries the amount')
await p.screenshot({path:`${O}/rfq.png`, fullPage:true})

// Customisable like every other document.
await p.goto(BASE+'/school/templates'); await p.waitForTimeout(700)
ok((await p.locator('button', { hasText: 'Request for Quotation' }).count())>0, 'RFQ is in the template customiser')
await p.getByRole('button',{name:'Request for Quotation'}).click(); await p.waitForTimeout(600)
ok((await p.locator('article').innerText()).includes('REQUEST FOR QUOTATION'), 'customiser previews the RFQ')

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
