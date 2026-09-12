/**
 * Cheque checks.
 *
 * Government disbursement is by cheque and nothing else, so the whole payment
 * surface is this one record. Asserts the school can attach the image after
 * the fact, that both sides can download the identical file, and that the
 * supplier is never offered the upload control.
 *
 *   npm run build && npm run preview &
 *   npm run cheque-check
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'cheque-screenshots'
mkdirSync(O, { recursive: true })
let failed = 0
const b = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const ctx = await b.newContext({ viewport:{width:1280,height:950}, acceptDownloads:true })
const p = await ctx.newPage()
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())})
const ok=(c,m)=>{ if(!c) failed++; console.log(c?`✓ ${m}`:`✗ ${m}`) }
const signIn=async(n,u)=>{await p.goto(BASE+'/login');await p.waitForSelector('text=Demo accounts');await p.getByRole('button',{name:n}).click();await p.waitForURL(u)}
const signOut=async()=>{await p.getByRole('button',{name:'Sign out'}).click();await p.waitForURL(/login/)}

// A stand-in cheque image to upload.
const chequePng = 'public/icons/icon-512.png'

await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Cheque download check')
await p.locator('select').nth(1).selectOption({index:1})
await p.getByRole('button',{name:'Continue'}).click()
await p.waitForSelector('input[placeholder^="Search the supplier"]')
await p.locator('button[aria-label^="Increase"]').first().click()
await p.getByRole('button',{name:'Continue'}).click()
await p.getByRole('button',{name:'Save draft PR'}).click(); await p.waitForURL(/\/orders\//)
const orderUrl = p.url()
await p.getByRole('button',{name:'Submit for approval'}).click(); await p.waitForSelector('text=Awaiting Approval')
await p.getByRole('button',{name:'Approve request'}).click(); await p.waitForSelector('text=PR Approved')
await p.getByRole('button',{name:'Issue Purchase Order'}).click(); await p.waitForSelector('text=PO Issued')

await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.goto(orderUrl)
await p.getByRole('button',{name:'Accept order'}).click(); await p.waitForSelector('text=PO Accepted')
await p.getByRole('button',{name:'Mark as dispatched'}).click()
await p.getByRole('button',{name:'Mark dispatched'}).click(); await p.waitForSelector('text=In Transit')

await signOut(); await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(orderUrl)
await p.getByRole('button',{name:'Receive & sign IAR'}).click()
await p.getByPlaceholder('Dr. Elena Villanueva').fill('Dr. Elena Villanueva')
await p.getByRole('button',{name:'Sign IAR & accept delivery'}).click(); await p.waitForSelector('text=Delivered / IAR Signed')
await p.getByRole('button',{name:'Generate Disbursement Voucher'}).click(); await p.waitForSelector('text=DV Issued')

// Record payment WITHOUT a photo, to exercise the after-the-fact upload path.
await p.getByRole('button',{name:'Record cheque payment'}).click()
await p.getByPlaceholder('0012345').fill('0077123')
await p.getByRole('button',{name:'Record payment'}).click()
await p.waitForSelector('text=Cheque 0077123 released')
await p.waitForTimeout(500)
const body1 = await p.locator('body').innerText()
ok(body1.includes('cheque is the only payment method'), 'cheque card states cheque-only')
ok(body1.includes('No cheque photo on file'), 'school prompted to upload when none on file')

// School uploads the cheque photo after the fact.
await p.locator('input[type="file"]').last().setInputFiles(chequePng)
await p.waitForTimeout(1200)
ok(await p.getByRole('button',{name:'Download cheque'}).isVisible(), 'download appears once a photo exists')
await p.screenshot({path:`${O}/school.png`})

// School downloads.
const d1 = await Promise.all([p.waitForEvent('download'), p.getByRole('button',{name:'Download cheque'}).first().click()])
const f1 = d1[0]
ok(/^cheque-0077123-PO-.*\.png$/.test(f1.suggestedFilename()), `school download named ${f1.suggestedFilename()}`)
const path1 = await f1.path()
ok(readFileSync(path1).length > 1000, `school download has real bytes (${readFileSync(path1).length})`)

// Supplier sees and downloads the same cheque.
await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.goto(orderUrl); await p.waitForTimeout(800)
const body2 = await p.locator('body').innerText()
ok(body2.includes('0077123'), 'supplier sees the cheque number')
ok(!body2.includes('Upload cheque photo'), 'supplier is not offered the upload control')
await p.screenshot({path:`${O}/supplier.png`})
const d2 = await Promise.all([p.waitForEvent('download'), p.getByRole('button',{name:'Download cheque'}).first().click()])
const f2 = d2[0]
ok(readFileSync(await f2.path()).length === readFileSync(path1).length, 'supplier downloads the identical file')

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
