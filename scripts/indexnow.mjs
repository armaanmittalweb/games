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

// Engines share submissions with each other, but each is asked directly: api.indexnow.org, the shared address,
// has been unreachable from some networks. 200 or 202 means accepted.
const body = JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList })
let accepted = 0
for (const endpoint of ['https://www.bing.com/indexnow', 'https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow']) {
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body, signal: AbortSignal.timeout(30_000) })
    console.log(`${endpoint} answered ${res.status} for ${urlList.length} URLs`)
    if (res.ok) accepted++
  } catch (e) {
    console.log(`${endpoint} unreachable: ${e.cause?.code ?? e.message}`)
  }
}
if (!accepted) process.exitCode = 1
