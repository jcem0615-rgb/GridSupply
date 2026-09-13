/**
 * Supplier clients checks.
 *
 * The load-bearing assertions are the boundaries: a school is only a client
 * once it has issued a purchase order, the school's own record stays
 * read-only, and the school side cannot reach the supplier's private notes.
 *
 *   npm run build && npm run preview &
 *   npm run clients-check
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'clients-screenshots'
mkdirSync(O, { recursive: true })
let failed = 0
const b = await chromium.launch(
  process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {},
)
const ctx = await b.newContext({ viewport:{width:1280,height:900} })
const p = await ctx.newPage()
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message))
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())})
const ok=(c,m)=>{ if(!c) failed++; console.log(c?`✓ ${m}`:`✗ ${m}`) }
const signIn=async(n,u)=>{await p.goto(BASE+'/login');await p.waitForSelector('text=Demo accounts');await p.getByRole('button',{name:n}).click();await p.waitForURL(u)}
const signOut=async()=>{await p.getByRole('button',{name:'Sign out'}).click();await p.waitForURL(/login/)}

// Before any PO exists, the school must not be listed as a client.
await signIn(/Marites Delos Reyes/, /supplier/)
await p.goto(BASE+'/supplier/clients'); await p.waitForTimeout(700)
ok((await p.locator('body').innerText()).includes('No clients yet'), 'no clients before any PO is issued')

// School raises a PR and issues the PO.
await signOut(); await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Client page check')
await p.locator('select').nth(1).selectOption({index:1})
await p.getByRole('button',{name:'Continue'}).click()
await p.waitForSelector('input[placeholder^="Search the supplier"]')
await p.locator('button[aria-label^="Increase"]').first().click()
await p.getByRole('button',{name:'Continue'}).click()
await p.getByRole('button',{name:'Save draft PR'}).click(); await p.waitForURL(/\/orders\//)
await p.getByRole('button',{name:'Submit for approval'}).click(); await p.waitForSelector('text=Awaiting Approval')
await p.getByRole('button',{name:'Approve request'}).click(); await p.waitForSelector('text=PR Approved')
await p.getByRole('button',{name:'Issue Purchase Order'}).click(); await p.waitForSelector('text=PO Issued')

// Supplier now sees the school as a client.
await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.getByRole('link',{name:'Clients'}).click(); await p.waitForURL(/clients/); await p.waitForTimeout(700)
ok((await p.locator('body').innerText()).includes('Bagong Silang'), 'school appears as a client once a PO exists')
await p.screenshot({path:`${O}/list.png`})

await p.locator('li a').first().click(); await p.waitForURL(/clients\/.+/); await p.waitForTimeout(600)
const detail = await p.locator('body').innerText()
ok(detail.includes('School record'), 'detail shows the official school record')
ok(detail.includes('000-123-456-00000'), 'detail shows the school TIN')
ok(detail.includes('Order history'), 'detail lists order history')
ok(detail.includes('only the school can change them'), 'read-only boundary is stated')

// Editable relationship fields persist.
await p.getByPlaceholder('Who you actually deal with').fill('Mr. Ramon Diaz')
await p.getByPlaceholder('0917-555-0142').last().fill('0918-222-3344')
await p.getByPlaceholder(/Deliver to the stockroom/).fill('Stockroom behind Building B, until 3pm.')
await p.getByRole('button',{name:'Save'}).click()
await p.waitForSelector('text=Saved ✓')
await p.screenshot({path:`${O}/detail.png`, fullPage:true})
await p.reload(); await p.waitForTimeout(900)
ok((await p.locator('input[placeholder="Who you actually deal with"]').inputValue())==='Mr. Ramon Diaz','notes survive a reload')

await p.goto(BASE+'/supplier/clients'); await p.waitForTimeout(700)
ok((await p.locator('body').innerText()).includes('Mr. Ramon Diaz'),'contact shows on the list row')

// The school side must never see supplier notes.
await signOut(); await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/supplier/clients'); await p.waitForTimeout(800)
ok(/\/school/.test(p.url()), 'school is redirected away from the supplier clients route')

// Supplier team CRUD: add, edit, suspend, reset, delete.
await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.goto(BASE+'/supplier/team'); await p.waitForTimeout(700)
await p.getByRole('button',{name:'Add employee'}).click()
await p.locator('input').first().fill('Rico Aquino')
await p.locator('input[type="email"]').fill('rico@northgate.ph')
await p.getByPlaceholder('Sales Associate').fill('Delivery Lead')
await p.getByRole('button',{name:'Save'}).click(); await p.waitForTimeout(700)
ok((await p.locator('body').innerText()).includes('Rico Aquino'), 'team: add employee')
const tRow = p.locator('li', { hasText: 'Rico Aquino' }).first()
await tRow.getByRole('button',{name:'Edit'}).click()
await p.getByPlaceholder('Sales Associate').fill('Warehouse Supervisor')
await p.getByRole('button',{name:'Save'}).click(); await p.waitForTimeout(600)
await p.reload(); await p.waitForTimeout(900)
await tRow.getByRole('button',{name:'Edit'}).click()
ok((await p.getByPlaceholder('Sales Associate').inputValue())==='Warehouse Supervisor','team: edit persists')
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
await tRow.getByRole('button',{name:'paused'}).click(); await p.waitForTimeout(500)
ok((await tRow.innerText()).includes('paused'), 'team: suspend')
await tRow.getByRole('button',{name:'active'}).click(); await p.waitForTimeout(400)
await tRow.getByRole('button',{name:'Reset password'}).click()
await p.getByRole('button',{name:'Reset password', exact:true}).last().click()
await p.waitForSelector('text=Temporary password')
ok(true, 'team: reset password')
await p.getByRole('button',{name:'Done'}).click(); await p.waitForTimeout(500)
ok((await p.locator('li', { hasText: 'Marites Delos Reyes' }).count())===0,
   'team: the owner is not listed among the staff they manage')
ok((await p.locator('body').innerText()).includes('Change my password'),
   'team: the owner has a path to change their own password')
await tRow.getByRole('button',{name:'Delete'}).click()
await p.getByRole('button',{name:'Remove'}).click(); await p.waitForTimeout(800)
ok(!(await p.locator('body').innerText()).includes('Rico Aquino'), 'team: delete')

// Six tabs still usable on a phone.
await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.setViewportSize({width:390,height:844}); await p.goto(BASE+'/supplier/clients'); await p.waitForTimeout(700)
const labels = await p.locator('nav.no-print >> nth=-1').innerText()
ok(labels.includes('Clients'), `bottom nav includes Clients (${labels.replace(/\n/g,' ')})`)
await p.screenshot({path:`${O}/mobile.png`})

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
