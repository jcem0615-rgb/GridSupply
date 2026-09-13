/**
 * Units of measure and supplier inventory.
 *
 * Units: a buyer should never have to guess whether 20 means pieces or boxes,
 * so the unit is asserted wherever a quantity or price is read.
 *
 * Inventory: the load-bearing assertions are that accepting a PO draws stock
 * down, that the ledger records the balance it left behind, that stock clamps
 * at zero, and that a school cannot see a supplier's shelves.
 *
 *   npm run build && npm run preview &
 *   npm run inventory-check
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'inventory-screenshots'
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
const signOut=async()=>{await p.getByRole('button',{name:'Sign out'}).click();await p.waitForURL(/login/)}

// --- Units are spelled out where a buyer reads them ---
await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Unit and stock check')
await p.locator('select').nth(1).selectOption({index:1})
await p.getByRole('button',{name:'Continue'}).click()
await p.waitForSelector('input[placeholder^="Search the supplier"]')
await p.locator('input[placeholder^="Search the supplier"]').fill('Whiteboard Marker')
await p.waitForTimeout(400)
let body = await p.locator('body').innerText()
ok(body.includes('per box'), 'picker prices read "per box", not "/ box"')
ok(body.includes('12 per box'), 'picker shows what one box contains')
const row = p.locator('li', { hasText: 'Whiteboard Marker' }).first()
await row.locator('button[aria-label^="Increase"]').click()
await p.waitForTimeout(300)
ok((await row.innerText()).includes('Box'), 'unit shown beside the quantity stepper')
await row.locator('button[aria-label^="Increase"]').click()
await p.waitForTimeout(300)
ok((await row.innerText()).includes('Boxes'), 'unit pluralises with the quantity')
await p.screenshot({path:`${O}/picker.png`})
await p.getByRole('button',{name:'Continue'}).click()
await p.waitForSelector('text=Total (VAT inclusive)')
ok((await p.locator('table').innerText()).includes('2 Boxes'), 'review step spells the unit out')
await p.getByRole('button',{name:'Save draft PR'}).click(); await p.waitForURL(/\/orders\//)
const orderUrl = p.url()
ok((await p.locator('table').first().innerText()).includes('2 Boxes'), 'order lines spell the unit out')
await p.getByRole('button',{name:'Submit for approval'}).click(); await p.waitForSelector('text=Awaiting Approval')
await p.getByRole('button',{name:'Approve request'}).click(); await p.waitForSelector('text=PR Approved')
await p.getByRole('button',{name:'Issue Purchase Order'}).click(); await p.waitForSelector('text=PO Issued')

// --- Inventory ---
await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.goto(BASE+'/supplier/inventory'); await p.waitForTimeout(800)
body = await p.locator('body').innerText()
ok(body.includes('Low stock'), 'inventory flags low stock')
ok(body.includes('Out of stock'), 'inventory flags out of stock')
ok(body.includes('64 Boxes'), 'stock shown with its unit')
await p.screenshot({path:`${O}/inventory.png`})

await p.getByRole('button',{name:'Low'}).click(); await p.waitForTimeout(500)
const low = await p.locator('body').innerText()
ok(low.includes('Chalk, Dustless'), 'low filter isolates items at or below reorder level')
ok(!low.includes('Bond Paper A4'), 'low filter excludes healthy stock')
await p.getByRole('button',{name:'All'}).click(); await p.waitForTimeout(400)

// Receiving stock records a movement.
const chalk = p.locator('li', { hasText: 'Chalk, Dustless' }).first()
await chalk.getByRole('button',{name:'Adjust'}).click()
await p.getByPlaceholder('0').fill('40')
await p.getByPlaceholder('Delivery receipt 1123').fill('DR-5521')
await p.getByRole('button',{name:'Record movement'}).click(); await p.waitForTimeout(800)
ok((await p.locator('li', { hasText: 'Chalk, Dustless' }).first().innerText()).includes('48 Boxes'),
   'receiving stock raises the balance 8 -> 48')

await p.getByRole('button',{name:'Movements'}).click(); await p.waitForTimeout(600)
const led = await p.locator('body').innerText()
ok(led.includes('Stock received') && led.includes('DR-5521'), 'ledger records the receipt with its note')
ok(led.includes('→ 48'), 'ledger row carries the balance after the move')

// Accepting the PO draws stock down.
await p.goto(orderUrl); await p.waitForTimeout(600)
await p.getByRole('button',{name:'Accept order'}).click(); await p.waitForSelector('text=PO Accepted')
await p.waitForTimeout(900)
await p.goto(BASE+'/supplier/inventory'); await p.waitForTimeout(800)
const marker = p.locator('li', { hasText: 'Whiteboard Marker' }).first()
ok((await marker.innerText()).includes('62 Boxes'), 'accepting the PO drew 2 boxes down from 64')
await p.getByRole('button',{name:'Movements'}).click(); await p.waitForTimeout(600)
ok((await p.locator('body').innerText()).includes('Reserved for order'), 'ledger attributes the draw-down to the order')
await p.screenshot({path:`${O}/ledger.png`})

// Counting in a different unit converts into the stocking unit.
await p.getByRole('button',{name:'Stock'}).click(); await p.waitForTimeout(500)
const chalk2 = p.locator('li', { hasText: 'Chalk, Dustless' }).first()
await chalk2.getByRole('button',{name:'Adjust'}).click(); await p.waitForTimeout(300)
ok(await p.getByLabel('Unit of measure').isVisible(), 'the adjust form offers a unit of measure')
ok((await p.getByLabel('Unit of measure').inputValue()) === 'box',
   'it defaults to the item\'s own stocking unit')
ok(!(await p.getByLabel('Units per pack').isVisible().catch(()=>false)),
   'no conversion is asked for while counting in the stocking unit')

await p.getByLabel('Unit of measure').selectOption('pack'); await p.waitForTimeout(250)
await p.getByLabel('Quantity').fill('3')
ok(await p.getByLabel('Units per pack').isVisible(),
   'choosing another unit asks how many stocking units it holds')
ok(await p.getByRole('button',{name:'Record movement'}).isDisabled(),
   'the form will not record a conversion with no factor')

await p.getByLabel('Units per pack').fill('6'); await p.waitForTimeout(250)
const preview = await p.locator('.glass-quiet', { hasText: 'on hand becomes' }).first().innerText()
ok(preview.includes('3 Packs') && preview.includes('18 Boxes'),
   'the form shows the conversion before it is recorded')
ok(preview.includes('66 Boxes'), 'and the balance the movement will leave behind')
await p.screenshot({path:`${O}/adjust-units.png`})

await p.getByRole('button',{name:'Record movement'}).click(); await p.waitForTimeout(800)
ok((await p.locator('li', { hasText: 'Chalk, Dustless' }).first().innerText()).includes('66 Boxes'),
   '3 packs of 6 boxes added 18 boxes, not 3')
await p.getByRole('button',{name:'Movements'}).click(); await p.waitForTimeout(600)
const conv = await p.locator('body').innerText()
ok(conv.includes('3 Packs × 6 Boxes = 18 Boxes'), 'the ledger keeps the arithmetic that produced the move')
ok(conv.includes('→ 66'), 'and the balance it left behind, in the stocking unit')

// Stock must never go negative.
await p.getByRole('button',{name:'Stock'}).click(); await p.waitForTimeout(500)
const folder = p.locator('li', { hasText: 'Folder, Long' }).first()
await folder.getByRole('button',{name:'Adjust'}).click()
await p.getByPlaceholder('0').fill('-50')
await p.getByRole('button',{name:'Record movement'}).click(); await p.waitForTimeout(800)
ok((await p.locator('li', { hasText: 'Folder, Long' }).first().innerText()).includes('0 Packs'),
   'stock clamps at zero rather than going negative')

// A school must not see supplier stock.
await signOut(); await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/supplier/inventory'); await p.waitForTimeout(800)
ok(/\/school/.test(p.url()), 'school is redirected away from supplier inventory')

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
