// Checks the content pools: no item twice in a pool, and how many plays each pool lasts before anything repeats.
import { MIND_MELD, MOST_LIKELY } from '../src/content/party'
import { ESTIMATES } from '../src/content/estimates'
import { BLUFF_WORDS } from '../src/content/bluff'
import { IMPOSTER_PAIRS } from '../src/content/imposter'
import { TRIVIA } from '../src/content/trivia'
import { THEMES, TELEPHONE_STARTS } from '../src/content/draw'
import { BASE_WORDS, DESI_WORDS } from '../src/content/codewords'
import { ANSWERS } from '../src/words'
import { dealAt, norm } from '../src/engine'

export function checkContent(): number {
  let failures = 0
  const pools: [string, string[]][] = [
    ['mindmeld', MIND_MELD],
    ['mostlikely', MOST_LIKELY],
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
