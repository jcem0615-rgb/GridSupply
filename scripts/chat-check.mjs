/**
 * Chat reachability checks.
 *
 * The thread itself always worked; what failed was finding it. These assert the
 * surfaces that make a conversation discoverable — the header badge, the
 * Messages list, the deep link — and that the mobile composer is on screen
 * without scrolling, since a composer below the fold reads as a missing
 * feature.
 *
 *   npm run build && npm run preview &
 *   npm run chat-check
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173'
const O = process.env.SMOKE_SHOTS ?? 'chat-screenshots'
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

const signIn = async (name,url) => {
  await p.goto(BASE+'/login'); await p.waitForSelector('text=Demo accounts')
  await p.getByRole('button',{name}).click(); await p.waitForURL(url)
}
const signOut = async () => { await p.getByRole('button',{name:'Sign out'}).click(); await p.waitForURL(/login/) }

// School raises an order and issues the PO.
await signIn(/Dr. Elena Villanueva/, /school/)
await p.goto(BASE+'/school/new')
await p.getByPlaceholder(/Supplies for the 2nd quarter/).fill('Chat discoverability')
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

// School posts a message.
await p.getByRole('button',{name:'Thread'}).click()
await p.getByPlaceholder('Write a message…').fill('Please deliver before Friday.')
await p.getByRole('button',{name:'Send'}).click()
await p.waitForSelector('text=Please deliver before Friday.')
ok(true,'school can post in the thread')

// Supplier: header badge + Messages list surface it without opening the order.
await signOut(); await signIn(/Marites Delos Reyes/, /supplier/)
await p.waitForTimeout(900)
const badge = p.locator('a[aria-label^="Messages"] span').first()
ok(await badge.isVisible(), `header shows an unread badge (${(await badge.innerText().catch(()=>'-')).trim()})`)

await p.getByRole('link',{name:/Messages/}).click()
await p.waitForURL(/messages/); await p.waitForTimeout(600)
const body = await p.locator('body').innerText()
ok(body.includes('Please deliver before Friday.'),'Messages list previews the last message')
ok(body.includes('Bagong Silang'),'Messages list names the counterpart')
await p.screenshot({path:`${O}/messages.png`})

// Deep link opens straight into the conversation and clears the badge.
await p.locator('li a').first().click()
await p.waitForURL(/\/orders\/.*tab=thread/)
await p.waitForSelector('text=Please deliver before Friday.')
ok(true,'Messages row deep-links into the Thread tab')
await p.screenshot({path:`${O}/supplier-thread.png`})

await p.goto(BASE+'/supplier'); await p.waitForTimeout(900)
ok(!(await p.locator('a[aria-label^="Messages"] span').first().isVisible().catch(()=>false)),
   'badge clears once the thread has been read')

// Mobile composer is no longer clipped.
await p.goto(orderUrl+'?tab=thread'); await p.waitForTimeout(600)
await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(600)
const ta = p.getByPlaceholder('Write a message…')
const diag = await p.evaluate(() => {
  const t = document.querySelector('textarea')
  const nav = [...document.querySelectorAll('nav')].pop()
  const main = document.querySelector('main')
  return {
    taBottom: Math.round(t.getBoundingClientRect().bottom),
    navTop: Math.round(nav.getBoundingClientRect().top),
    viewport: innerHeight,
    docH: document.documentElement.scrollHeight,
    scrollY: Math.round(scrollY),
    mainPad: getComputedStyle(main).paddingBottom,
  }
})
console.log('  diag:', JSON.stringify(diag))
const box = await ta.boundingBox()
ok(box.width > 150, `composer is ${Math.round(box.width)}px wide`)
ok(diag.taBottom <= diag.navTop + 2, 'composer is visible above the nav without scrolling')
await ta.fill('Noted, arriving Thursday.')
await p.getByRole('button',{name:'Send'}).click()
await p.waitForSelector('text=Noted, arriving Thursday.')
ok(true,'can send from mobile')
await p.screenshot({path:`${O}/mobile-thread.png`})

console.log('\nerrors:', errs.length?errs.join('\n'):'none')
await b.close()
process.exit(failed || errs.length ? 1 : 0)
