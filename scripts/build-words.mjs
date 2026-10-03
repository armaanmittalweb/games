// Builds data/allowed.txt: the guesses the game accepts. Real English words only: SCOWL up to size 55
// (the common, everyday part of the list spell checkers use) in its shared, American and British
// spellings, lower-case so names are left out, plus every answer word.
//   node scripts/build-words.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dir = require.resolve('wordlist-english/package.json').replace(/package\.json$/, '')
const words = new Set(readFileSync('data/answers.txt', 'utf8').split(/\s+/).filter(Boolean))
for (const size of [10, 20, 35, 40, 50, 55]) {
  for (const variant of ['english', 'american', 'british']) {
    for (const w of JSON.parse(readFileSync(`${dir}${variant}-words-${size}.json`, 'utf8'))) {
      if (/^[a-z]{5}$/.test(w)) words.add(w)
    }
  }
}
writeFileSync('data/allowed.txt', [...words].sort().join('\n') + '\n')
copyFileSync(`${dir}Copyright`, 'data/SCOWL-COPYRIGHT')
console.log(`${words.size} words`)
