// Four browsers join one room and play every game to its results screen, clicking whatever each screen offers.
// Fails on any page error. Screenshots go to test/shots/.
//   npm run dev   (in another terminal), then: node test/e2e.mjs [gameId] [--url=https://games.amittal.dev]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const BASE = (args.find(a => a.startsWith('--url=')) ?? '--url=http://localhost:8799').slice(6)
const only = args.find(a => !a.startsWith('--'))
// --theme=dark|light pins the colours (otherwise the browser's setting decides) and keeps those screenshots apart.
const THEME = (args.find(a => a.startsWith('--theme=')) ?? '').slice(8)
const SHOTS = THEME ? `test/shots/${THEME}` : 'test/shots'
mkdirSync(SHOTS, { recursive: true })

// Short settings so every game finishes in a minute or two.
const QUICK = {
  draw: { rounds: 1, seconds: 30 }, telephone: { writeSeconds: 15, drawSeconds: 20 }, imposter: { rounds: 1, clues: 1, clueSeconds: 10, talkSeconds: 15 },
  codewords: { timer: 60 }, wordle: { mode: 'blitz', words: 2, roundSeconds: 25 }, bluff: { rounds: 2, writeSeconds: 20, voteSeconds: 10 },
  mindmeld: { rounds: 3, seconds: 10 }, mostlikely: { rounds: 3, seconds: 10 }, trivia: { rounds: 3, seconds: 6 }, wordgrid: { minutes: 1 },
  lastcard: { hand: 4, turnSeconds: 10 }, stopwatch: { rounds: 3 }, reaction: { rounds: 3 }, closest: { rounds: 3, seconds: 10 },
  connections: { puzzles: 1, seconds: 60 }, geoguess: { rounds: 3, seconds: 12 }, musicguess: { rounds: 3, seconds: 10 }, movieguess: { rounds: 3, seconds: 21 },
  mastermind: { rounds: 1, seconds: 60 }, territory: { seconds: 5, size: 'small' }, auction: { lots: 9, seconds: 6 }, make24: { rounds: 3, seconds: 20 },
}
const TEXT = ['apple', 'mango', 'cricket', 'samosa', 'blue', 'tiger', '42', '1990', 'a small bird', 'crane']
const NAMES = ['Asha', 'Bilal', 'Chen', 'Dev']

const browser = await chromium.launch()
const errors = []
const pages = []
for (let i = 0; i < NAMES.length; i++) {
  const mobile = i === 3
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(([n, t]) => { try { localStorage.setItem('wr.name', n); if (t) localStorage.setItem('gn.theme', t) } catch {} }, [NAMES[i], THEME])
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${NAMES[i]}: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|favicon|net::|AudioContext encountered an error from the audio device/.test(m.text())) errors.push(`${NAMES[i]} console: ${m.text()}`) })
  page.on('dialog', d => d.accept())
  pages.push(page)
}
const [host] = pages
await host.goto(BASE + '/')
await host.click('text=Create a room')
await host.waitForURL(/\/r\/[A-Z0-9]{5}$/)
const url = host.url()
console.log('room', url)
for (const p of pages.slice(1)) await p.goto(url)
await host.waitForFunction(() => document.querySelectorAll('.plist li').length >= 4)
// A shared screen (TV mode) follows every game; its errors count like a player's.
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const tv = await tvCtx.newPage()
tv.on('pageerror', e => errors.push(`TV: ${e.message}`))
tv.on('console', m => { if (m.type() === 'error' && !/WebSocket|favicon|net::|AudioContext/.test(m.text())) errors.push(`TV console: ${m.text()}`) })
await tv.goto(url.replace('/r/', '/tv/'))
await tv.waitForSelector('.tv-lobby')
await tv.screenshot({ path: `${SHOTS}/tv-lobby.png` })

const send = (page, m) => page.evaluate(async m => (await import('/js/core.js')).send(m), m)
const visible = async (page, sel) => { try { return await page.locator(sel).first().isVisible() } catch { return false } }
const rnd = a => a[Math.floor(Math.random() * a.length)]

/** One move for one player: whatever the screen offers. */
async function step(page, id) {
  // `force` taps something that never holds still (the pulsing Last card! button) without waiting for it to stop.
  const tryClick = async (sel, force = false) => { const l = page.locator(sel); const n = await l.count(); if (!n) return false; try { await l.nth(Math.floor(Math.random() * n)).click({ timeout: 800, force }); return true } catch { return false } }
  if (await tryClick('.choose button')) return
  if (id === 'territory' && await tryClick('.tt-cell.can')) return
  if (id === 'auction' && Math.random() < 0.5 && await tryClick('.au-raise button.primary:not([disabled])')) return
  if (id === 'mastermind' && await visible(page, '.mm-palette')) {
    for (let k = 0; k < 4; k++) await tryClick('.mm-palette .mm-peg')
    await tryClick('.mm-row.cur button.primary:not([disabled])')
    return
  }
  if (id === 'connections' && await visible(page, '.cn-word:not([disabled])')) {
    await tryClick('button:has-text("Clear"):not([disabled])')
    for (let k = 0; k < 4; k++) await tryClick('.cn-word:not(.sel):not([disabled])')
    await tryClick('button:has-text("Submit"):not([disabled])')
    return
  }
  if (id === 'geoguess' && await visible(page, '.geo-map canvas')) {
    const box = await page.locator('.geo-map canvas').boundingBox()
    if (box && await visible(page, 'button:has-text("Lock in")')) {
      await page.mouse.click(box.x + box.width * (0.2 + Math.random() * 0.6), box.y + box.height * (0.2 + Math.random() * 0.6))
      await tryClick('button:has-text("Lock in"):not([disabled])')
    }
    return
  }
  if (id === 'make24' && await visible(page, '.m24-card')) {
    if (await page.locator('.m24 .m24-card').count() === 1) { await tryClick('button:has-text("Start again")'); return }
    await tryClick('.m24 .m24-card'); await tryClick('.m24-op:not([disabled])'); await tryClick('.m24 .m24-card:not(.sel)')
    return
  }
  if (await visible(page, 'canvas.edit')) {
    const box = await page.locator('canvas.edit').boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width * Math.random(), box.y + box.height * Math.random())
      await page.mouse.down()
      for (let k = 0; k < 6; k++) await page.mouse.move(box.x + box.width * Math.random(), box.y + box.height * Math.random(), { steps: 3 })
      await page.mouse.up()
    }
    if (id === 'telephone' && Math.random() < 0.5) await tryClick('button:has-text("Done")')
    return
  }
  if (id === 'stopwatch' && Math.random() < 0.3 && await tryClick('.sw-btn:not([disabled])')) return
  if (await tryClick('.rx.rx-go')) return
  if (await tryClick('.target')) return
  if (id === 'wordle' && await visible(page, '.kb')) { await page.keyboard.type(rnd(['crane', 'slate', 'smile', 'beach'])); await page.keyboard.press('Enter'); return }
  if (await visible(page, '.clue-form')) { await page.fill('.clue-form input', 'zebra' + 'abcdefgh'[Math.floor(Math.random() * 8)]); await page.click('.clue-form button'); return }
  if (id === 'codewords' && await tryClick('button:has-text("Start")')) return
  if (await tryClick('.cwc:not([disabled])')) return
  if (await tryClick('.lc-call', true)) return
  if (await tryClick('.lc-hand .lc.ok', true)) { await tryClick('.lc-wheelpick button'); return }
  if (await tryClick('.lc-wheelpick button')) return
  if (await tryClick('.lc-actions button:has-text("Draw a card"), .lc-actions button:has-text("Keep it and pass"), .lc-actions button:has-text("Take ")')) return
  if (await tryClick('.who:not([disabled])')) return
  if (await tryClick('.choice:not([disabled])')) return
  if (await tryClick('.def:not([disabled])')) return
  if (await tryClick('button:has-text("Ready to vote")')) return
  if (await tryClick('button:has-text("Show next"), button:has-text("Next book"), button:has-text("Finish")')) return
  if (id === 'telephone' && await tryClick('.like:not([disabled])')) return
  if (id === 'wordgrid' && await visible(page, '.wg .answer input')) { await page.fill('.wg .answer input', rnd(['tea', 'set', 'rat', 'note', 'stone', 'are'])); await page.press('.wg .answer input', 'Enter'); return }
  const input = page.locator('.game-area .answer input:not([disabled])')
  if (await input.count()) {
    const val = id === 'closest' ? String(Math.floor(Math.random() * 3000)) : rnd(TEXT) + (id === 'bluff' ? ' ' + Math.random().toString(36).slice(2, 6) : '')
    try { await input.first().fill(val); await input.first().press('Enter') } catch { /* moved on */ }
  }
}

let introShot = false, rated = false
async function play(id) {
  const t0 = Date.now()
  await send(host, { t: 'pick', id })
  await send(host, { t: 'config', id, config: QUICK[id] })
  await host.waitForTimeout(300)
  await host.locator('.detail button.primary').click()
  await host.waitForSelector('.intro-wait', { timeout: 8000 })
  // The rules come up first. Three players press Got it; the phone taps outside the box. The game starts once all have.
  await Promise.all(pages.map(p => p.waitForSelector('.intro-card', { timeout: 8000 })))
  if (!introShot) {
    introShot = true
    await host.screenshot({ path: `${SHOTS}/intro-desktop.png` })
    await pages[3].screenshot({ path: `${SHOTS}/intro-phone.png` })
  }
  await Promise.all(pages.map((p, i) => i === 3 ? p.mouse.click(4, 120) : p.click('.intro-card button.primary')))
  await Promise.all(pages.map(p => p.waitForSelector('.intro-card', { state: 'detached', timeout: 4000 })))
  await host.waitForSelector('.intro-wait', { state: 'detached', timeout: 8000 })
  let shot = false
  while (Date.now() - t0 < 240_000) {
    if (await visible(host, '.results')) break
    await Promise.all(pages.map(p => step(p, id).catch(() => {})))
    if (!shot && Date.now() - t0 > 7000) {
      shot = true
      await host.screenshot({ path: `${SHOTS}/${id}-desktop.png` })
      await pages[3].screenshot({ path: `${SHOTS}/${id}-phone.png` })
      await tv.screenshot({ path: `${SHOTS}/${id}-tv.png` })
    }
    await host.waitForTimeout(250)
  }
  const done = await visible(host, '.results')
  if (done) {
    const rows = await host.locator('.results .tbl tr').count()
    await host.screenshot({ path: `${SHOTS}/${id}-results.png`, fullPage: true })
    // A sticker from the results screen reaches the TV.
    await pages[3].click('.react-fab'); await pages[3].click('.react-btn[aria-label="On fire"]')
    try { await tv.waitForSelector('.react-float .rf', { timeout: 3000 }) } catch { errors.push(`${id}: a reaction did not reach the TV`) }
    if (await tv.locator('.tv .res-actions, .tv .fb').count()) errors.push(`${id}: the TV shows buttons meant for players`)
    await tv.screenshot({ path: `${SHOTS}/${id}-tv-results.png` })
    if (!rated) {
      rated = true
      await host.click('.fb .stars button:nth-child(4)')
      await host.click('.fb button:has-text("Yes")')
      await host.fill('.fb input', 'e2e: the timer felt short')
      await host.click('.fb button:has-text("Send")')
      await host.waitForSelector('.fb', { state: 'detached' })
    }
    console.log(`${done ? 'ok  ' : 'FAIL'} ${id}: ${Math.round((Date.now() - t0) / 1000)}s, ${rows - 1} rows in the standings`)
    await send(host, { t: 'lobby' })
  } else {
    errors.push(`${id}: did not reach the results in time (screens saved as ${id}-stuck-*.png)`)
    await Promise.all(pages.map((p, i) => p.screenshot({ path: `${SHOTS}/${id}-stuck-${NAMES[i]}.png` }).catch(() => {})))
    await send(host, { t: 'abort' })
  }
  await host.waitForTimeout(500)
}

const ids = only ? only.split(',').filter(x => x !== 'night') : Object.keys(QUICK)
for (const id of ids) await play(id)

if (!only || only.includes('night')) {
  // A game night: plan one, start it, check the banner, stop.
  await host.click('button[role="tab"]:has-text("Game night")')
  await host.click('text=Plan the night')
  await host.waitForSelector('.plan li')
  const planned = await host.locator('.plan li').count()
  await host.click('text=Start the night')
  await host.waitForSelector('.night-banner')
  await host.screenshot({ path: `${SHOTS}/night.png` })
  console.log(`ok   game night: ${planned} games planned, first one started`)
  await send(host, { t: 'abort' })
  await send(host, { t: 'nightEnd' })
}

await browser.close()
if (errors.length) { console.log('ERRORS:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1 }
else console.log('no page errors')
