/**
 * School accounts checks.
 *
 * A school is the Principal plus at most one admin who does the same work. The
 * assertions that matter are the boundaries: the limit holds, the admin cannot
 * manage accounts, and every action is attributed to whichever of the two
 * performed it — including after that account is deleted.
 *
 *   npm run build && npm run preview &
 *   npm run school-check
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'school-screenshots'
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

await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/school/team'); await p.waitForTimeout(700)
ok((await p.locator('body').innerText()).includes('Grace Tolentino'), 'principal sees the school admin')
ok((await p.locator('body').innerText()).includes('already has its admin'), 'one-admin limit is stated')
ok(await p.getByRole('button',{name:'Add admin'}).isDisabled(), 'Add admin disabled at the limit')
await p.screenshot({path:`${O}/team.png`})

// The admin does real work; the principal must see it, attributed.
await signOut(); await signIn(/Grace Tolentino/, /school/)
ok(/\/school/.test(p.url()), 'admin lands in the school portal')
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Raised by the admin')
await p.locator('select').nth(1).selectOption({index:1})
await p.getByRole('button',{name:'Continue'}).click()
await p.waitForSelector('input[placeholder^="Search the supplier"]')
await p.locator('button[aria-label^="Increase"]').first().click()
await p.getByRole('button',{name:'Continue'}).click()
await p.getByRole('button',{name:'Save draft PR'}).click(); await p.waitForURL(/\/orders\//)
const orderUrl = p.url()
await p.getByRole('button',{name:'Submit for approval'}).click(); await p.waitForSelector('text=Awaiting Approval')
ok(true, 'admin can raise and submit a PR')

// Admin must not manage accounts.
await p.goto(BASE+'/school/team'); await p.waitForTimeout(600)
ok((await p.locator('body').innerText()).includes('Only the Principal manages'), 'admin is refused account management')

// Principal sees the admin's order, labelled.
await signOut(); await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(orderUrl); await p.waitForTimeout(700)
const trail = await p.locator('body').innerText()
ok(trail.includes('Raised by the admin'), "principal sees the admin's order")
ok(trail.includes('Grace Tolentino'), 'audit trail names the admin')
ok(/Grace Tolentino\s*·\s*School Admin/.test(trail), 'audit trail labels the actor as School Admin')
await p.screenshot({path:`${O}/trail.png`})

// Principal acts on the same order; both attributions coexist.
await p.getByRole('button',{name:'Approve request'}).click(); await p.waitForSelector('text=PR Approved')
await p.waitForTimeout(400)
const both = await p.locator('body').innerText()
ok(/Dr. Elena Villanueva\s*·\s*School Principal/.test(both), 'principal action labelled School Principal')
ok(/Grace Tolentino\s*·\s*School Admin/.test(both), 'admin action still labelled School Admin')
await p.screenshot({path:`${O}/trail-both.png`, fullPage:true})

// Principal can reset the admin's password.
await p.goto(BASE+'/school/team'); await p.waitForTimeout(600)
const row = p.locator('li', { hasText: 'Grace Tolentino' }).first()
await row.getByRole('button',{name:'Reset password'}).click()
await p.getByRole('button',{name:'Reset password', exact:true}).last().click()
await p.waitForSelector('text=Temporary password')
ok(true, 'principal can reset the admin password')
await p.getByRole('button',{name:'Done'}).click()
await p.waitForSelector('text=must change password')

// Edit, then delete, then the limit frees up.
await row.getByRole('button',{name:'Edit'}).click()
await p.getByPlaceholder('Administrative Officer').fill('Admin Officer II')
await p.getByRole('button',{name:'Save'}).click(); await p.waitForTimeout(600)
ok((await p.locator('body').innerText()).includes('Grace Tolentino'), 'edit saved')

await row.getByRole('button',{name:'Delete'}).click()
await p.getByRole('button',{name:'Remove'}).click(); await p.waitForTimeout(700)
const after = await p.locator('body').innerText()
ok(!after.includes('Grace Tolentino'), 'admin removed')
ok(!(await p.getByRole('button',{name:'Add admin'}).isDisabled()), 'Add admin re-enabled after removal')

// The deleted admin keeps their name in the trail.
await p.goto(orderUrl); await p.waitForTimeout(700)
const kept = await p.locator('body').innerText()
ok(/Grace Tolentino\s*·\s*School Admin/.test(kept), 'audit trail survives the account deletion')

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
