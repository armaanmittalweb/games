// Phone checks for every screen: a desktop host plus three phones (390 × 844 portrait, 360 × 640 small Android,
// 844 × 390 landscape) go through the home page, the lobby, the invite sheet, every game and the results. On each
// screen and phone it looks for sideways scrolling, tap targets under 44 px, the keyboard hiding the answer box, the
// address bar coming and going, turning the phone mid-game, and a phone that sleeps (goes offline) and wakes.
// Every text box is also typed into the way Android keyboards type (each word is a composition that grows a letter
// at a time; a page that rewrites the box mid-word makes the letters come out backwards), with the keyboard up in
// portrait and landscape. Drag areas (drawing, Word Grid, the map) must not scroll the page under a finger, and a
// pull down in a room must not reload it.
//   npm run dev, then: node test/mobile.mjs [game ids…] [--url=https://games.amittal.dev] [--shots=<dir>]
// Prints a report; exits 1 on a hard failure (sideways scroll, a target under 32 px, a hidden answer box, no
// reconnect). Targets of 32–43 px are listed as warnings.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const BASE = (args.find(a => a.startsWith('--url=')) ?? '--url=http://localhost:8799').slice(6)
const SHOTS = args.find(a => a.startsWith('--shots='))?.slice(8)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const ALL = ['draw', 'imposter', 'codewords', 'wordle', 'telephone', 'bluff', 'mindmeld', 'mostlikely', 'trivia', 'wordgrid', 'lastcard',
  'reaction', 'closest', 'stopwatch', 'connections', 'geoguess', 'musicguess', 'movieguess', 'mastermind', 'territory', 'auction', 'make24']
const GAMES = args.filter(a => !a.startsWith('--')).length ? args.filter(a => !a.startsWith('--')) : ALL

const PHONES = [
  { name: 'Bilal', label: 'portrait 390×844', viewport: { width: 390, height: 844 } },
  { name: 'Chen', label: 'small 360×640', viewport: { width: 360, height: 640 } },
  { name: 'Dev', label: 'landscape 844×390', viewport: { width: 844, height: 390 } },
]
const KEYBOARD = 300 // px a phone keyboard takes in portrait
const KEYBOARD_LANDSCAPE = 200 // and lying on its side
const kbHeight = vp => vp.height > vp.width ? KEYBOARD : KEYBOARD_LANDSCAPE

const browser = await chromium.launch()
const fails = [], warns = []
const fail = (where, msg) => { fails.push(`${where}: ${msg}`) }
const warn = (where, msg) => { warns.push(`${where}: ${msg}`) }

async function contextFor(p) {
  const ctx = await browser.newContext(p ? { viewport: p.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(n => {
    try { localStorage.setItem('wr.name', n); localStorage.setItem('lc.mute', '1') } catch {}
  }, p?.name ?? 'Asha')
  // The room's line runs through the test, so a phone can lose it the way a sleeping phone does.
  const net = { asleep: false, lines: [] }
  await ctx.routeWebSocket(/\/ws$/, ws => {
    if (net.asleep) return ws.close({ code: 1001 })
    net.lines.push(ws)
    ws.connectToServer()
  })
  const page = await ctx.newPage()
  page.cdp = p ? await ctx.newCDPSession(page) : null
  page.on('pageerror', e => fail(p?.name ?? 'Asha', `page error: ${e.message}`))
  page.on('dialog', d => d.accept())
  return { ctx, page, net }
}

/** Sideways overflow and small tap targets on whatever is on screen. */
async function audit(page, where) {
  const r = await page.evaluate(() => {
    const W = innerWidth
    const desc = e => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${e.textContent?.trim() ? ` "${e.textContent.trim().slice(0, 14)}"` : e.getAttribute('aria-label') ? ` [${e.getAttribute('aria-label').slice(0, 18)}]` : ''}`
    const over = document.documentElement.scrollWidth - W
    const wide = over > 1 ? [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > W + 1 && getComputedStyle(e).position !== 'fixed' }).slice(-3).map(desc) : []
    const small = []
    for (const e of document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], summary')) {
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e)
      if (!b.width || !b.height || cs.visibility === 'hidden' || e.disabled || e.closest('[aria-hidden="true"]')) continue
      if (b.bottom < 0 || b.top > innerHeight * 3) continue
      if (e.tagName === 'A' && e.closest('p, li, td, .dim')) continue // links inside running text
      const m = Math.min(b.width, b.height), M = Math.max(b.width, b.height)
      // A keyboard key (30 × 50 on a small phone) is narrow but tall: only a target small both ways fails.
      if (m < 44) small.push([m < 28 || (m < 32 && M < 44) ? 'fail' : 'warn', `${desc(e)} ${Math.round(b.width)}×${Math.round(b.height)}`])
    }
    return { over, wide, small }
  })
  if (r.over > 1) fail(where, `scrolls sideways by ${r.over}px (${r.wide.join(', ')})`)
  const seen = new Set()
  for (const [level, d] of r.small) {
    if (seen.has(d)) continue
    seen.add(d)
    if (level === 'fail') fail(where, `tap target ${d}`); else warn(where, `tap target ${d}`)
  }
}

/** Types `text` the way Gboard does: each word grows as a composition, then is committed. */
async function gboard(page, text) {
  for (const word of text.split(' ')) {
    for (let i = 1; i <= word.length; i++) {
      await page.cdp.send('Input.imeSetComposition', { text: word.slice(0, i), selectionStart: i, selectionEnd: i })
      await page.waitForTimeout(60)
    }
    await page.cdp.send('Input.insertText', { text: word })
    if (word !== text.split(' ').at(-1)) await page.cdp.send('Input.insertText', { text: ' ' })
  }
}

/** Focus `sel`, bring the keyboard up, check the box is in view and uncovered, type into it, check the letters. */
async function typeWithKeyboard(page, p, sel, where, text) {
  const box = page.locator(sel).first()
  if (!(await box.count()) || !(await box.isVisible())) return false
  await box.tap()
  await page.setViewportSize({ width: p.viewport.width, height: p.viewport.height - kbHeight(p.viewport) })
  await page.waitForTimeout(250)
  const r = await page.evaluate(s => {
    const e = document.querySelector(s)
    e.scrollIntoView({ block: 'nearest' })
    const b = e.getBoundingClientRect()
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return { inView: b.top >= -1 && b.bottom <= innerHeight + 1, covered: !(top === e || e.contains(top)), coveredBy: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}` : '' }
  }, sel)
  if (!r.inView) fail(where, 'keyboard: the box is pushed out of view')
  else if (r.covered) fail(where, `keyboard: the box is covered by ${r.coveredBy}`)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  if (over > 1) fail(where, `keyboard: the page scrolls sideways by ${over}px`)
  await box.fill('')
  await gboard(page, text)
  await page.waitForTimeout(300)
  const got = await box.inputValue()
  if (got.toLowerCase() !== text.toLowerCase()) fail(where, `typing "${text}" with a phone keyboard gave "${got}"`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${where.replace(/[^a-z0-9]+/gi, '-')}-keyboard.png` })
  await box.fill('')
  await page.evaluate(() => document.activeElement?.blur())
  await page.setViewportSize(p.viewport)
  await page.waitForTimeout(150)
  return true
}

/** Drag areas keep the page still under a finger, and a pull down in a room does not reload it. */
async function noAccidentalScroll(page, where) {
  const r = await page.evaluate(() => ({
    drag: [...document.querySelectorAll('.canvas canvas, .wgrid, .geo-map canvas')].filter(e => e.getBoundingClientRect().width && getComputedStyle(e).touchAction !== 'none').map(e => e.className || e.tagName),
    pull: getComputedStyle(document.documentElement).overscrollBehaviorY,
  }))
  for (const d of r.drag) fail(where, `drag area ${d} lets the page scroll (touch-action is not none)`)
  if (r.pull !== 'none') fail(where, `a pull down can reload the room (overscroll-behavior-y: ${r.pull})`)
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, '-')}.png` }) }

// ---------- go ----------

const host = await contextFor(null)
const phones = []
for (const p of PHONES) phones.push({ ...p, ...(await contextFor(p)) })

// Home page on every phone.
for (const ph of phones) {
  await ph.page.goto(BASE + '/')
  await ph.page.waitForSelector('.hero-card')
  await audit(ph.page, `home · ${ph.label}`)
  await shot(ph.page, `home-${ph.name}`)
  // Pasting a whole share message into the code box keeps just the code.
  await ph.page.fill('.code-in', 'Join my game night room AB2CD https://games.amittal.dev/r/AB2CD')
  if ((await ph.page.inputValue('.code-in')) !== 'AB2CD') fail(`home · ${ph.label}`, `pasted link gave "${await ph.page.inputValue('.code-in')}", not AB2CD`)
  await ph.page.fill('.code-in', '')
  await typeWithKeyboard(ph.page, ph, '#name', `home name · ${ph.label}`, 'Armaan')
  await typeWithKeyboard(ph.page, ph, '.code-in', `home code · ${ph.label}`, 'ab2cd')
}

await host.page.goto(BASE + '/')
await host.page.click('text=Create a room')
await host.page.waitForURL(/\/r\/[A-Z0-9]{5}$/)
const url = host.page.url()
for (const ph of phones) await ph.page.goto(url)
await host.page.waitForFunction(n => document.querySelectorAll('.plist li').length >= n, phones.length + 1)
const send = (page, m) => page.evaluate(async m => (await import('/js/core.js')).send(m), m)

for (const ph of phones) {
  await audit(ph.page, `lobby · ${ph.label}`)
  await shot(ph.page, `lobby-${ph.name}`)
  await ph.page.click('.invite-btns button[aria-label="Show a QR code"]')
  await ph.page.waitForSelector('.qr svg', { timeout: 5000 }).catch(() => fail(`invite · ${ph.label}`, 'no QR code'))
  await audit(ph.page, `invite · ${ph.label}`)
  await shot(ph.page, `invite-${ph.name}`)
  await ph.page.click('.invite-card button[aria-label="Close"]')
}

// Settings that keep every game short.
const QUICK = {
  draw: { rounds: 1, seconds: 30 }, imposter: { rounds: 1 }, telephone: { seconds: 40 }, bluff: { rounds: 1 }, mindmeld: { rounds: 1 }, mostlikely: { rounds: 1 },
  trivia: { rounds: 1, seconds: 10 }, wordgrid: { seconds: 60 }, lastcard: { hand: 5 }, reaction: { rounds: 3 }, closest: { rounds: 1, seconds: 15 }, stopwatch: { rounds: 1 },
  connections: { puzzles: 1, seconds: 60 }, geoguess: { rounds: 1, seconds: 60 }, musicguess: { rounds: 1, seconds: 20 }, movieguess: { rounds: 1, seconds: 30 },
  mastermind: { rounds: 1, seconds: 60 }, territory: { seconds: 10, size: 'small' }, auction: { lots: 5, seconds: 10 }, make24: { rounds: 1, seconds: 40 }, wordle: { rounds: 1 }, codewords: {},
}

for (const id of GAMES) {
  await send(host.page, { t: 'pick', id })
  await send(host.page, { t: 'config', id, config: QUICK[id] ?? {} })
  await host.page.waitForTimeout(250)
  await send(host.page, { t: 'start', id })
  const all = [host, ...phones]
  await Promise.all(all.map(x => x.page.waitForSelector('.intro-card', { timeout: 8000 }).catch(() => {})))
  for (const x of all) await x.page.click('.intro-card button.primary').catch(() => {})
  await host.page.waitForSelector('.game-area', { timeout: 10000 }).catch(() => fail(id, 'the game did not start'))
  await host.page.waitForTimeout(1500)
  for (const ph of phones) {
    const where = `${id} · ${ph.label}`
    await ph.page.waitForSelector('.game-area', { timeout: 5000 }).catch(() => {})
    await audit(ph.page, where)
    await noAccidentalScroll(ph.page, where)
    await shot(ph.page, `${id}-${ph.name}`)
    await typeWithKeyboard(ph.page, ph, '.game-area input:not([disabled]):not([type=number]):not([type=range]), .game-area textarea', where, id === 'closest' || id === 'auction' ? '1999' : 'sholay is great')
  }
  // The address bar hides and shows (the window gets taller and shorter), then the phone is turned and turned back.
  const b = phones[0]
  for (const vp of [{ width: 390, height: 760 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await b.page.setViewportSize(vp)
    await b.page.waitForTimeout(300)
  }
  await audit(b.page, `${id} · turned to landscape`)
  await shot(b.page, `${id}-Bilal-turned`)
  await b.page.setViewportSize(b.viewport)
  await b.page.waitForTimeout(300)
  await audit(b.page, `${id} · turned back`)
  if (await host.page.locator('.results').count()) continue
  await send(host.page, { t: 'abort' })
  await host.page.waitForSelector('.lobby', { timeout: 5000 }).catch(() => {})
}

// A phone that sleeps mid-game: its connection drops and it stays offline for 40 s (the page keeps retrying and
// backing off), then the screen comes back on. It has to be back in the live game within a couple of seconds.
{
  await send(host.page, { t: 'pick', id: 'closest' })
  await send(host.page, { t: 'config', id: 'closest', config: { rounds: 3, seconds: 60 } })
  await host.page.waitForTimeout(200)
  await send(host.page, { t: 'start', id: 'closest' })
  const all = [host, ...phones]
  await Promise.all(all.map(x => x.page.waitForSelector('.intro-card', { timeout: 8000 }).catch(() => {})))
  for (const x of all) await x.page.click('.intro-card button.primary').catch(() => {})
  await host.page.waitForSelector('.game-area', { timeout: 10000 })
  const b = phones[0]
  b.net.asleep = true
  for (const line of b.net.lines.splice(0)) await line.close({ code: 1001 }).catch(() => {})
  await b.page.waitForTimeout(3000)
  if ((await b.page.evaluate(async () => (await import('/js/core.js')).S.status)) === 'open') fail('sleep', 'still connected after the line was cut (the test did not cut it)')
  await b.page.waitForTimeout(37_000)
  b.net.asleep = false
  await b.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const t0 = Date.now()
  const status = () => b.page.evaluate(async () => (await import('/js/core.js')).S.status)
  let ok = false
  while (!ok && Date.now() - t0 < 15000) { ok = (await status()) === 'open'; if (!ok) await b.page.waitForTimeout(100) }
  const took = (Date.now() - t0) / 1000
  if (!ok) fail('sleep', 'no reconnect within 15 s of waking')
  else if (took > 3) fail('sleep', `took ${took.toFixed(1)} s to reconnect after waking`)
  else console.log(`sleep: back in ${took.toFixed(1)} s after waking`)
  const same = await b.page.evaluate(async () => { const { S } = await import('/js/core.js'); return S.room?.phase === 'game' && !!S.game })
  if (!same) fail('sleep', 'woke up without the live game')
  await send(host.page, { t: 'abort' })
  await host.page.waitForSelector('.lobby', { timeout: 5000 }).catch(() => {})
}

// Results, after a real game: Stop the Clock, everyone stops at once.
{
  await send(host.page, { t: 'pick', id: 'reaction' })
  await send(host.page, { t: 'config', id: 'reaction', config: { rounds: 3 } })
  await host.page.waitForTimeout(200)
  await send(host.page, { t: 'start', id: 'reaction' })
  const all = [host, ...phones]
  await Promise.all(all.map(x => x.page.waitForSelector('.intro-card', { timeout: 8000 }).catch(() => {})))
  for (const x of all) await x.page.click('.intro-card button.primary').catch(() => {})
  const end = Date.now() + 90_000
  while (Date.now() < end && !(await host.page.locator('.results').count())) {
    for (const x of all) await x.page.locator('.rx').first().click({ timeout: 300 }).catch(() => {})
    await host.page.waitForTimeout(400)
  }
  if (!(await host.page.locator('.results').count())) fail('results', 'the game did not finish')
  await host.page.waitForTimeout(2600) // the podium and the confetti
  await shot(host.page, 'results-host')
  for (const ph of phones) {
    await audit(ph.page, `results · ${ph.label}`)
    await shot(ph.page, `results-${ph.name}`)
    // The actions stay on screen at the bottom.
    const r = await ph.page.locator('.res-actions').boundingBox()
    if (!r || r.y + r.height > ph.viewport.height + 1) fail(`results · ${ph.label}`, 'the actions are below the screen')
  }
  await phones[0].page.click('.res-actions button:has-text("I’m in")')
  await host.page.waitForSelector('.in-list', { timeout: 5000 }).catch(() => fail('results', 'the host does not see who is in'))
  await shot(host.page, 'results-host-in')
}

await browser.close()
console.log(`\n${GAMES.length} games, ${PHONES.length} phones`)
for (const w of [...new Set(warns)]) console.log('warn ', w)
for (const f of [...new Set(fails)]) console.log('FAIL ', f)
console.log(fails.length ? `\n${new Set(fails).size} failures` : '\nno failures')
process.exit(fails.length ? 1 : 0)
