// Counts Most Likely To prompts per file and pack, and lists near-duplicates (same words in a different order or with
// one small word changed). node scripts/count-likely.mjs
import { readdirSync, readFileSync } from 'node:fs'

const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const all = []
for (const f of readdirSync('src/content/likely')) {
  const items = [...readFileSync(`src/content/likely/${f}`, 'utf8').split('export default [')[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
  console.log(f.padEnd(28), items.length)
  for (const t of items) all.push({ f, t })
}
const spicy = all.filter(x => x.f.startsWith('spicy')).length
console.log(`spicy ${spicy}, clean ${all.length - spicy}, total ${all.length}`)
const seen = new Map()
for (const x of all) {
  const k = norm(x.t)
  if (seen.has(k)) console.log(`same: "${x.t}" (${x.f}) and (${seen.get(k)})`)
  seen.set(k, x.f)
}
// Near-duplicates: identical once the small words are dropped and the rest sorted.
const SMALL = new Set(['a', 'an', 'the', 'their', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'with', 'by', 'every', 'all', 'from', 'it', 'is'])
const key = t => norm(t).split(' ').filter(w => !SMALL.has(w)).sort().join(' ')
const near = new Map()
for (const x of all) {
  const k = key(x.t)
  if (near.has(k) && norm(near.get(k)) !== norm(x.t)) console.log(`near: "${x.t}" ~ "${near.get(k)}"`)
  near.set(k, x.t)
}
