// Builds src/content/trivia.json, the Trivia question bank:
//   - the Open Trivia Database (data/opentdb.json, from scripts/fetch-trivia.mjs; CC BY-SA 4.0), minus categories and
//     questions that only make sense to an American audience (anime, comics, US sports and politics…), and
//   - questions about India written for this game (data/india-trivia.mjs).
//   node scripts/build-trivia.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import india from '../data/india-trivia.mjs'

const CATS = {
  'General Knowledge': 'general', 'Entertainment: Books': 'general', Art: 'general', Vehicles: 'general',
  'Science & Nature': 'science', 'Science: Mathematics': 'science', Animals: 'science',
  Geography: 'geography', History: 'history', Mythology: 'history',
  'Entertainment: Film': 'screen', 'Entertainment: Television': 'screen', 'Entertainment: Cartoon & Animations': 'screen',
  'Entertainment: Music': 'music', Sports: 'sports',
  'Science: Computers': 'tech', 'Science: Gadgets': 'tech',
  'Entertainment: Video Games': 'games',
}
const US = /\b(NFL|NBA|MLB|NHL|NCAA|NASCAR|Super ?Bowl|baseball|American football|touchdown|quarterback|Stanley Cup|World Series|U\.?S\.? states?|American states?|Senat(e|or)|Congress(man|woman)?|Governor|Electoral|Thanksgiving|ZIP code|Founding Fathers|Confedera(te|cy)|presidents? of the United States|U\.?S\.? presidents?|American presidents?|Saturday Night Live|Jeopardy|Wrestle ?Mania|WWE|sitcom)\b/i

const opentdb = JSON.parse(readFileSync('data/opentdb.json', 'utf8'))
const out = []
for (const q of opentdb) {
  const c = CATS[q.category]
  if (!c) continue
  if (US.test(q.question) || US.test(q.answer) || q.wrong.some(w => US.test(w))) continue
  if (q.question.length > 200 || q.answer.length > 60 || q.wrong.some(w => w.length > 60)) continue
  // "Which of these is NOT…" questions read badly against a clock.
  if (/\bNOT\b/.test(q.question)) continue
  out.push({ c, d: q.difficulty, q: q.question, a: q.answer, w: q.type === 'boolean' ? [q.answer === 'True' ? 'False' : 'True'] : q.wrong })
}
for (const [d, q, a, w] of india) out.push({ c: 'india', d, q, a, w })
// The same question asked twice (the database has a few, and some overlap the India set): keep the last, so ours wins.
const key = q => q.q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const last = new Map(out.map((q, i) => [key(q), i]))
out.splice(0, out.length, ...out.filter((q, i) => last.get(key(q)) === i))
writeFileSync('src/content/trivia.json', JSON.stringify(out))
const by = {}
for (const q of out) by[q.c] = (by[q.c] ?? 0) + 1
console.log(out.length, 'questions', by)
