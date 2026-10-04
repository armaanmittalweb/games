// Downloads the Open Trivia Database (https://opentdb.com, CC BY-SA 4.0) question bank into data/opentdb.json.
// The API hands out 50 questions per call and asks for one call every 5 seconds; a session token stops repeats.
//   node scripts/fetch-trivia.mjs
import { writeFileSync } from 'node:fs'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const get = async url => (await fetch(url, { signal: AbortSignal.timeout(30_000) })).json()
const { token } = await get('https://opentdb.com/api_token.php?command=request')
const out = []
for (let tries = 0; tries < 400; tries++) {
  await sleep(5500)
  let j
  try { j = await get(`https://opentdb.com/api.php?amount=50&encode=url3986&token=${token}`) } catch (e) { console.log('retry', e.message); continue }
  if (j.response_code === 5) { await sleep(5000); continue } // rate limited
  if (j.response_code !== 0) break // 4: token has seen every question
  out.push(...j.results.map(q => ({
    category: decodeURIComponent(q.category), type: q.type, difficulty: q.difficulty,
    question: decodeURIComponent(q.question), answer: decodeURIComponent(q.correct_answer),
    wrong: q.incorrect_answers.map(decodeURIComponent),
  })))
  console.log(out.length)
}
writeFileSync('data/opentdb.json', JSON.stringify(out, null, 0))
console.log(`saved ${out.length} questions`)
