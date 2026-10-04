// Renders the share image (public/og.png, 1200x630) and the app icons from HTML with Playwright.
//   npx playwright install chromium   (once)
//   node scripts/make-images.mjs
import { chromium } from 'playwright'

const base = `*{box-sizing:border-box;margin:0}body{background:#121213;color:#f2f2f2;font-family:Arial,Helvetica,sans-serif}
.t{display:flex;align-items:center;justify-content:center;font-weight:800;text-transform:uppercase}
.g2{background:#538d4e}.g1{background:#b59f3b}.g0{background:#3a3a3c}`

const og = `<html><head><style>${base}
body{width:1200px;height:630px;display:flex;align-items:center;gap:60px;padding:0 70px;font-family:"Segoe UI",Arial,sans-serif}
.games{display:grid;grid-template-columns:repeat(4,110px);gap:14px}
.g{width:110px;height:110px;border-radius:22px;background:#1c1c1f;border:2px solid #3a3a3c;display:flex;align-items:center;justify-content:center;font-size:58px}
h1{font-size:84px;line-height:1;letter-spacing:-1px}h2{font-size:34px;color:#cfcfd4;font-weight:600;margin-top:16px;line-height:1.25}
.lb{margin-top:30px;display:grid;gap:10px;width:420px}
.p{display:flex;align-items:center;gap:14px;background:#1c1c1f;border:2px solid #3a3a3c;border-radius:12px;padding:10px 18px;font-size:26px}
.p b{width:28px;color:#9a9aa0}.p span{flex:1}.p i{font-style:normal;font-weight:700}
.url{margin-top:26px;font-size:26px;color:#8fd18a;font-weight:700}
</style></head><body>
<div class="games">${['🎨', '🕵️', '🧩', '🟩', '📞', '📖', '🧠', '👉', '❓', '🔤', '🃏', '🎲'].map(e => `<div class="g">${e}</div>`).join('')}</div>
<div>
<h1>Game Night</h1>
<h2>Party games with friends,<br>in the browser. One room, one leaderboard.</h2>
<div class="lb"><div class="p"><b>1</b><span>Riya</span><i>34 pts</i></div><div class="p"><b>2</b><span>Kabir</span><i>29 pts</i></div><div class="p"><b>3</b><span>Armaan</span><i>27 pts</i></div></div>
<div class="url">games.amittal.dev · free, no sign-up</div>
</div></body></html>`

const pip = (x, y, size) => `<circle cx="${x}" cy="${y}" r="${size}"/>`
const icon = size => `<html><head><style>body{margin:0;width:${size}px;height:${size}px;background:#121213;display:grid;place-items:center}</style></head><body>
<svg width="${size * 0.82}" height="${size * 0.82}" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="14" fill="#538d4e"/><g fill="#fff">${pip(19, 19, 6)}${pip(45, 19, 6)}${pip(32, 32, 6)}${pip(19, 45, 6)}${pip(45, 45, 6)}</g></svg></body></html>`

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
