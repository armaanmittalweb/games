// Renders the share image (public/og.png, 1200x630) and the app icons from HTML with Playwright.
//   npx playwright install chromium   (once)
//   node scripts/make-images.mjs
import { chromium } from 'playwright'

const tile = (ch, c) => `<div class="t ${c}">${ch}</div>`
const row = (word, marks) => `<div class="r">${[...word].map((ch, i) => tile(ch, ['g0', 'g1', 'g2'][marks[i]])).join('')}</div>`
const base = `*{box-sizing:border-box;margin:0}body{background:#121213;color:#f2f2f2;font-family:Arial,Helvetica,sans-serif}
.t{display:flex;align-items:center;justify-content:center;font-weight:800;text-transform:uppercase}
.g2{background:#538d4e}.g1{background:#b59f3b}.g0{background:#3a3a3c}`

const og = `<html><head><style>${base}
body{width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 70px}
.board{display:grid;gap:8px}.r{display:flex;gap:8px}.t{width:76px;height:76px;font-size:40px}
.empty{border:3px solid #3a3a3c;background:none}
h1{font-size:76px;line-height:1;letter-spacing:-1px}h2{font-size:34px;color:#cfcfd4;font-weight:600;margin-top:14px;line-height:1.25}
.lb{margin-top:34px;display:grid;gap:12px;width:440px}
.p{display:flex;align-items:center;gap:14px;background:#1c1c1f;border:2px solid #3a3a3c;border-radius:12px;padding:12px 18px;font-size:26px}
.p b{width:30px;color:#9a9aa0}.p span{flex:1}.p i{font-style:normal;font-weight:700}
.url{margin-top:30px;font-size:26px;color:#8fd18a;font-weight:700}
</style></head><body>
<div class="board">
${row('crane', [1, 2, 2, 0, 2])}${row('trace', [2, 2, 2, 2, 2])}
<div class="r">${'<div class="t empty"></div>'.repeat(5)}</div><div class="r">${'<div class="t empty"></div>'.repeat(5)}</div>
</div>
<div>
<h1>Word Race</h1>
<h2>Multiplayer Wordle with friends.<br>Same words, one timer, live scores.</h2>
<div class="lb"><div class="p"><b>1</b><span>Riya</span><i>34 pts</i></div><div class="p"><b>2</b><span>Kabir</span><i>29 pts</i></div><div class="p"><b>3</b><span>Armaan</span><i>27 pts</i></div></div>
<div class="url">games.amittal.dev · free, no sign-up</div>
</div></body></html>`

const icon = size => `<html><head><style>${base}
body{width:${size}px;height:${size}px;display:grid;place-items:center;background:#121213}
.g{display:grid;grid-template-columns:1fr 1fr;gap:${size * 0.04}px;width:${size * 0.7}px;height:${size * 0.7}px}
.t{font-size:${size * 0.2}px;border-radius:${size * 0.03}px}
</style></head><body><div class="g">${tile('W', 'g2')}${tile('O', 'g1')}${tile('R', 'g0')}${tile('D', 'g2')}</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
const shot = async (html, w, h, path) => {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(html)
  await page.screenshot({ path, clip: { x: 0, y: 0, width: w, height: h } })
  console.log(path)
}
await shot(og, 1200, 630, 'public/og.png')
await shot(icon(512), 512, 512, 'public/icon-512.png')
await shot(icon(192), 192, 192, 'public/icon-192.png')
await shot(icon(180), 180, 180, 'public/apple-touch-icon.png')
await browser.close()
