// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver) that the pages in the sitemap changed, so they
// recrawl now instead of whenever they next pass by. Run after a deploy that changes page content:
//   node scripts/indexnow.mjs
// The key is the name of the public/<key>.txt file, which is served at the site root as proof of ownership.
import { readdirSync, readFileSync } from 'node:fs'

const HOST = 'games.amittal.dev'
const keyFile = readdirSync('public').find(f => /^[0-9a-f]{32}\.txt$/.test(f))
if (!keyFile) throw new Error('no public/<32 hex>.txt key file')
const key = keyFile.slice(0, -4)
const urlList = [...readFileSync('public/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
})
console.log(`IndexNow answered ${res.status} for ${urlList.length} URLs`)
if (res.status >= 400) process.exitCode = 1
