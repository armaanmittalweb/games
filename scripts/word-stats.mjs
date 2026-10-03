// Numbers for the tips page, worked out from the game's own lists: how often each letter appears in the answers,
// where it tends to sit, and which opening guesses narrow the answers down the most.
//   node scripts/word-stats.mjs > data/word-stats.json
import { readFileSync } from 'node:fs'

const lines = f => readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
const answers = lines('data/answers.txt')
const guesses = lines('data/allowed.txt')

function score(g, a) {
  const res = [0, 0, 0, 0, 0], left = {}
  for (let i = 0; i < 5; i++) { if (g[i] === a[i]) res[i] = 2; else left[a[i]] = (left[a[i]] ?? 0) + 1 }
  for (let i = 0; i < 5; i++) if (res[i] !== 2 && left[g[i]]) { res[i] = 1; left[g[i]]-- }
  return res.join('')
}

// Share of answers containing each letter, and the most common letter for each position.
const contains = {}, at = [{}, {}, {}, {}, {}]
for (const w of answers) {
  for (const c of new Set(w)) contains[c] = (contains[c] ?? 0) + 1
  ;[...w].forEach((c, i) => { at[i][c] = (at[i][c] ?? 0) + 1 })
}
const letters = Object.entries(contains).sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ letter: c, share: Math.round((n / answers.length) * 1000) / 10 }))
const positions = at.map(m => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => ({ letter: c, share: Math.round((n / answers.length) * 1000) / 10 })))

// For each guess: how many answers are still possible, on average, after seeing its colours.
const ranked = guesses.map(g => {
  const groups = new Map()
  for (const a of answers) { const k = score(g, a); groups.set(k, (groups.get(k) ?? 0) + 1) }
  let left = 0
  for (const n of groups.values()) left += n * n
  return { word: g, left: Math.round((left / answers.length) * 10) / 10, patterns: groups.size }
}).sort((a, b) => a.left - b.left)

const common = new Set(answers)
console.log(JSON.stringify({
  answers: answers.length,
  guesses: guesses.length,
  letters,
  positions,
  bestOpeners: ranked.slice(0, 10),
  bestCommonOpeners: ranked.filter(r => common.has(r.word)).slice(0, 10),
  popular: ['adieu', 'audio', 'crane', 'slate', 'stare', 'raise', 'arise', 'house'].map(w => ranked.find(r => r.word === w)).filter(Boolean),
}, null, 1))
