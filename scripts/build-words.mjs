// Builds the two word lists the game uses:
//   data/answers.txt  the words players are asked to guess: Wordle answers that are also among the 20,000 most
//                     common words in film and TV subtitles, so everyday words like "smile", not "parry" or "datum".
//   data/allowed.txt  the guesses accepted: real English words only. SCOWL up to size 55 (the everyday part of the
//                     list spell checkers use) in shared, American and British spellings, lower-case so names are
//                     left out, plus every Wordle answer.
//   data/dict.txt     the same SCOWL words at every length from 3 to 16 letters, for Word Grid.
//   node scripts/build-words.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const COMMON = 20_000
// Crude words and proper adjectives that are on the Wordle list but make poor answers for a group.
const SKIP = new Set(['sperm', 'fanny', 'booty', 'horny', 'pussy', 'fatty', 'dutch', 'welsh', 'slutty', 'bitch', 'penis', 'boobs', 'harem'])

const lines = f => readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
const wordle = lines('data/wordle-answers.txt').map(w => w.trim())

// hermitdave/FrequencyWords, OpenSubtitles 2018, English top 50k ("word count" per line, most common first).
const rank = new Map()
lines('data/subtitle-frequency.txt').forEach((l, i) => { const w = l.split(' ')[0]; if (!rank.has(w)) rank.set(w, i) })
const answers = wordle.filter(w => !SKIP.has(w) && rank.has(w) && rank.get(w) < COMMON)
writeFileSync('data/answers.txt', answers.join('\n') + '\n')

const require = createRequire(import.meta.url)
const dir = require.resolve('wordlist-english/package.json').replace(/package\.json$/, '')
const allowed = new Set(wordle)
const dict = new Set()
for (const size of [10, 20, 35, 40, 50, 55]) {
  for (const variant of ['english', 'american', 'british']) {
    for (const w of JSON.parse(readFileSync(`${dir}${variant}-words-${size}.json`, 'utf8'))) {
      if (/^[a-z]{5}$/.test(w)) allowed.add(w)
      if (/^[a-z]{3,16}$/.test(w)) dict.add(w)
    }
  }
}
writeFileSync('data/allowed.txt', [...allowed].sort().join('\n') + '\n')
writeFileSync('data/dict.txt', [...dict].sort().join('\n') + '\n')
copyFileSync(`${dir}Copyright`, 'data/SCOWL-COPYRIGHT')
console.log(`${answers.length} answers, ${allowed.size} accepted guesses, ${dict.size} words for Word Grid`)
