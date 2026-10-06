// Checks the content pools: no item twice in a pool, and how many plays each pool lasts before anything repeats.
import { readFileSync } from 'node:fs'
import { MIND_MELD } from '../src/content/party'
import { CLEAN, SPICY } from '../src/content/likely'
import { ESTIMATES } from '../src/content/estimates'
import { BLUFF_WORDS } from '../src/content/bluff'
import { IMPOSTER_PAIRS } from '../src/content/imposter'
import { TRIVIA } from '../src/content/trivia'
import { THEMES, TELEPHONE_STARTS } from '../src/content/draw'
import { BASE_WORDS, DESI_WORDS } from '../src/content/codewords'
import { ANSWERS } from '../src/words'
import { dealAt, norm } from '../src/engine'
import { GROUPS } from '../src/content/connections'
import { MOVIES } from '../src/content/movies'
import { SONGS } from '../src/content/songs'
import { HANDS } from '../src/content/make24'
import { CAPITALS, CITIES, COUNTRIES } from '../src/content/geo'
import { LOTS_BY_SET } from '../src/content/auction'
import { check, stepsFor } from '../src/games/make24'
import { distanceTo } from '../src/games/geoguess'
import { ICON_IDS, iconSvg } from '../src/icons'

export function checkContent(): number {
  let failures = 0
  const pools: [string, string[]][] = [
    ['mindmeld', MIND_MELD],
    ['mostlikely:classic', CLEAN],
    ['mostlikely:spicy', SPICY],
    ['mostlikely:mixed', [...CLEAN, ...SPICY]],
    ['closest', ESTIMATES.map(e => e.q)],
    ['bluff', BLUFF_WORDS.map(b => b.w)],
    ['imposter', IMPOSTER_PAIRS.map(p => [norm(p.a), norm(p.b)].sort().join(' | '))],
    ['trivia', TRIVIA.map(q => q.q)],
    ['trivia:india', TRIVIA.filter(q => q.c === 'india').map(q => q.q)],
    ...Object.entries(THEMES).map(([k, v]) => [`draw:${k}`, v] as [string, string[]]),
    ['telephone', TELEPHONE_STARTS],
    ['codewords', BASE_WORDS],
    ['codewords:desi', DESI_WORDS],
    ['wordle', ANSWERS],
    ['connections', GROUPS.map(gr => gr.name)],
    ['movies', MOVIES.map(m => m.t)],
    ['music', SONGS.map(s => `${s.t} (${s.f})`)],
    ['geo:countries', COUNTRIES.map(c => c.n)],
    ['geo:capitals', CAPITALS.map(c => c.n)],
    ['geo:cities', CITIES.map(c => c.n)],
  ]
  const rows: string[] = []
  for (const [name, items] of pools) {
    const seen = new Map<string, string>()
    for (const item of items) {
      const k = norm(item)
      if (!k) { failures++; console.log(`FAIL content ${name}: empty item`) }
      else if (seen.has(k)) { failures++; console.log(`FAIL content ${name}: "${item}" is in the pool twice`) }
      seen.set(k, item)
    }
    rows.push(`${name} ${items.length}`)
  }
  for (const p of IMPOSTER_PAIRS) if (norm(p.a) === norm(p.b)) { failures++; console.log(`FAIL content imposter: ${p.a} is paired with itself`) }
  for (const b of BLUFF_WORDS) if (!b.d || b.d.length < 4) { failures++; console.log(`FAIL content bluff: ${b.w} has no meaning`) }
  for (const q of TRIVIA) if (q.w.includes(q.a)) { failures++; console.log(`FAIL content trivia: the answer is also a wrong choice in "${q.q}"`) }
  for (const w of [...BASE_WORDS, ...DESI_WORDS]) if (/\s/.test(w)) { failures++; console.log(`FAIL content codewords: "${w}" is more than one word`) }
  for (const gr of GROUPS) {
    if (gr.words.length < 4) { failures++; console.log(`FAIL content connections: "${gr.name}" has fewer than four words`) }
    if (new Set(gr.words.map(norm)).size !== gr.words.length) { failures++; console.log(`FAIL content connections: "${gr.name}" has a word twice`) }
  }
  for (const m of MOVIES) {
    // The story must not give the film away by naming it.
    const words = norm(m.t).split(' ').filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'they', 'what', 'have', 'part', 'story', 'love', 'life'].includes(w))
    const hit = words.find(w => norm(m.p).split(' ').includes(w))
    if (hit) { failures++; console.log(`FAIL content movies: the story of ${m.t} says "${hit}"`) }
    if (!m.e || !m.p) { failures++; console.log(`FAIL content movies: ${m.t} has no clue`) }
  }
  for (const h of HANDS) {
    const err = check(h.slice(0, 4) as number[], stepsFor(h))
    if (err) { failures++; console.log(`FAIL content 24: ${h.slice(0, 4).join(' ')}: ${err}`) }
  }
  // A capital or city has to sit inside its own country (this checks the coordinates).
  const names = new Set(COUNTRIES.map(c => c.n))
  for (const p of [...CAPITALS, ...CITIES]) {
    const home = COUNTRIES.find(c => c.n === p.of)
    if (!home) { failures++; console.log(`FAIL content geo: ${p.n} is in "${p.of}", which is not a country on the map`); continue }
    const d = distanceTo(home, p).km
    // Outlines are simplified, so a city on the coast can sit a little offshore; 25 km catches real mistakes.
    if (d > 25) { failures++; console.log(`FAIL content geo: ${p.n} is ${Math.round(d)} km outside ${p.of}`) }
  }
  // Every country asked about has to be drawn on both maps, or its answer can't be shown.
  for (const file of ['lo', 'hi']) {
    const drawn = new Set(JSON.parse(readFileSync(`public/geo/${file}.json`, 'utf8')).c.filter((c: { r: number[][] }) => c.r.length).map((c: { n: string }) => c.n))
    for (const c of COUNTRIES) if (!drawn.has(c.shape)) { failures++; console.log(`FAIL content geo: ${c.n} is not drawn on the ${file} map`) }
  }
  // A country's label point is where its answer is marked, so it has to be inside the country.
  for (const c of COUNTRIES) if (distanceTo(c, c).km > 0) { failures++; console.log(`FAIL content geo: ${c.n}'s marker is outside it`) }
  // Icons are drawn into the shareable result card as image files, where an attribute given twice breaks the SVG.
  for (const id of ICON_IDS) {
    for (const tag of iconSvg(id).match(/<[a-z][^>]*>/g) ?? []) {
      const attrs = [...tag.matchAll(/\s([a-z-]+)=/g)].map(x => x[1])
      const twice = attrs.find((x, i) => attrs.indexOf(x) !== i)
      if (twice) { failures++; console.log(`FAIL content icons: ${id} has ${twice} twice in ${tag.slice(0, 40)}`) }
    }
  }
  if (names.size !== 195) { failures++; console.log(`FAIL content geo: ${names.size} countries, expected 195`) }
  for (const [set, lots] of Object.entries(LOTS_BY_SET)) if (lots.length < 5) { failures++; console.log(`FAIL content auction: ${set} has only ${lots.length} lots`) }
  // Dealing goes through the whole pool before anything comes back, whatever size each game takes.
  for (const [name, items] of pools) {
    const dealt = new Set<string>()
    for (let at = 0, n = 1; at + n <= items.length; at += n, n = (n % 9) + 1) {
      for (const item of dealAt(name, items, n, at)) {
        if (dealt.has(item)) { failures++; console.log(`FAIL deal ${name}: "${item}" came back at ${at}`); break }
        dealt.add(item)
      }
    }
  }
  console.log(`pools: ${rows.join(', ')}`)
  return failures
}
