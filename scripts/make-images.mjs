// Renders the share image (public/og.png, 1200x630), the app icons and favicon.svg from HTML with Playwright, in the
// site's own look: its two typefaces, its colours and the mark of two cards.
//   npx playwright install chromium   (once)
//   node scripts/make-images.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { CATALOG } from '../src/catalog.ts'
import { iconSvg, KINDS } from '../src/icons.ts'

const font = (family, file, weight) => `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(`public/fonts/${file}`).toString('base64')}) format('woff2')}`
const fonts = font('Onest', 'onest-latin.woff2', '400 900') + font('Unbounded', 'unbounded-latin.woff2', '500 900')

// The mark: a red card and a blue one, fanned. Drawn on a 64 grid.
const mark = `<rect x="15" y="15" width="22" height="31" rx="5" fill="#ff5a3c" transform="rotate(-14 26 30.5)"/><rect x="27" y="14" width="22" height="31" rx="5" fill="#3355ff" stroke="#121318" stroke-width="3" paint-order="stroke" transform="rotate(10 38 29.5)"/>`
const markTile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#121318"/><g transform="translate(-0.5 2.5)">${mark}</g></svg>`
writeFileSync('public/favicon.svg', markTile + '\n')

const card = (id, cls) => {
  const m = CATALOG.find(x => x.id === id), k = KINDS[m.cat]
  return `<div class="kc ${cls}" style="background:${k.bg};color:${k.ink}"><small>${m.cat}</small><span class="ic">${iconSvg(id, m.cat)}</span><b>${m.name}</b></div>`
}
const og = `<html><head><style>${fonts}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#eef0f3;color:#15161a;font-family:Onest,sans-serif;display:flex;align-items:center;gap:40px;padding:0 70px;overflow:hidden}
.text{flex:1}
.brand{display:flex;align-items:center;gap:14px;font:700 30px Unbounded,sans-serif;letter-spacing:-.02em}
.brand svg{width:46px;height:46px}
h1{font:800 70px/1.04 Unbounded,sans-serif;letter-spacing:-.035em;margin-top:34px}
p{font-size:28px;line-height:1.4;color:#4e5260;margin-top:22px;max-width:560px}
.url{margin-top:30px;display:inline-flex;align-items:center;height:58px;padding:0 26px;border-radius:29px;background:#15161a;color:#fff;font-size:24px;font-weight:700}
.art{position:relative;width:420px;height:440px;flex:none}
.kc{position:absolute;width:210px;height:284px;border-radius:32px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 26px 44px rgb(21 22 26/.2)}
.kc small{font-size:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.kc b{font:700 22px/1.15 Unbounded,sans-serif;letter-spacing:-.01em}
.ic{width:140px;height:140px;margin:-16px auto;display:block}.ic svg{width:100%;height:100%}
.c1{left:0;top:110px;transform:rotate(-11deg)}.c2{right:0;top:110px;transform:rotate(11deg)}.c3{left:100px;top:50px;width:222px;height:300px}
</style></head><body>
<div class="text"><div class="brand"><svg viewBox="0 0 64 64">${mark.replace('#121318', '#eef0f3')}</svg>Game Night</div>
<h1>Play together, each on your own phone</h1>
<p>${CATALOG.length} party games for 2 to 30 friends. One room, one leaderboard. Free, no sign-up.</p>
<div class="url">games.amittal.dev</div></div>
<div class="art">${card('wordle', 'c1')}${card('mindmeld', 'c2')}${card('draw', 'c3')}</div>
</body></html>`

const icon = size => `<html><head><style>body{margin:0;width:${size}px;height:${size}px;background:#121318;display:grid;place-items:center}</style></head><body>
<svg width="${size}" height="${size}" viewBox="0 0 64 64"><g transform="translate(-0.5 2.5)">${mark}</g></svg></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
const shot = async (html, w, h, path) => {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path, clip: { x: 0, y: 0, width: w, height: h } })
  console.log(path)
}
await shot(og, 1200, 630, 'public/og.png')
await shot(icon(512), 512, 512, 'public/icon-512.png')
await shot(icon(192), 192, 192, 'public/icon-192.png')
await shot(icon(180), 180, 180, 'public/apple-touch-icon.png')
await browser.close()
