// Plays a small, known scenario against a local dev server and checks the Switchboard numbers come out exactly right.
//   npm run dev (in another terminal), then: node test/analytics-sim.mjs
// Run it on a fresh local state (delete .wrangler/state) so nothing else is counted.
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:8799'
const KEY = readFileSync('.dev.vars', 'utf8').match(/INTERNAL_KEY\s*=\s*"?([^"\r\n]+)/)[1]
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('')
const wait = ms => new Promise(r => setTimeout(r, ms))
const ev = body => fetch(BASE + '/api/ev', { method: 'POST', body: JSON.stringify(body) })

function person(name, ref, path) {
  return { name, vid: rand(8), sid: rand(8), id: rand(8), secret: rand(16), ref, path }
}
const asha = person('Asha', 'https://www.google.com/', '/')
const bilal = person('Bilal', '', '/r/')
const chen = person('Chen', 'https://www.instagram.com/', '/')
const dev = person('Dev', 'https://www.bing.com/', '/games/trivia')

function connect(p, code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:8799/api/rooms/${code}/ws`)
    ws.last = null
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 's') ws.last = m.room }
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', id: p.id, secret: p.secret, name: p.name, vid: p.vid, sid: p.sid })); resolve(ws) }
    ws.onerror = reject
  })
}
const send = (ws, m) => ws.send(JSON.stringify(m))
async function until(ws, fn, ms = 90_000) {
  const t = Date.now()
  while (Date.now() - t < ms) { if (ws.last && fn(ws.last)) return; await wait(200) }
  throw new Error('timed out')
}

for (const p of [asha, bilal, chen, dev]) await ev({ t: 'view', vid: p.vid, sid: p.sid, path: p.path, ref: p.ref })
const { code } = await (await fetch(BASE + '/api/rooms', { method: 'POST' })).json()
const a = await connect(asha, code)
await until(a, r => r.members.length === 1)
const b = await connect(bilal, code)
let c = await connect(chen, code)
await until(a, r => r.members.filter(m => m.online).length === 3)
await ev({ t: 'share', vid: asha.vid, sid: asha.sid, method: 'native' })

// Game 1: Trivia, everyone closes the rules, it plays to the end.
send(a, { t: 'config', id: 'trivia', config: { rounds: 3, seconds: 5 } })
send(a, { t: 'start', id: 'trivia' })
await until(a, r => r.inst?.intro)
for (const ws of [a, b, c]) send(ws, { t: 'ready' })
await until(a, r => r.phase === 'game' && !r.inst.intro)
console.log('trivia began as soon as all three were ready')
await until(a, r => r.phase === 'results')
send(b, { t: 'fb', rating: 4, again: true, kind: 'idea', text: 'More India questions' })
send(c, { t: 'fb', rating: 2, again: false, kind: 'fix', text: 'Timer too short' })
await wait(500)

// Game 2: Closest Wins. Chen's line drops mid-game and comes back; then the host ends it early.
send(a, { t: 'start', id: 'closest' })
await until(a, r => r.inst?.intro && r.inst.id === 'closest')
for (const ws of [a, b, c]) send(ws, { t: 'ready' })
await until(a, r => r.phase === 'game' && !r.inst.intro)
c.close(4002, 'line dropped')
await until(a, r => !r.members.find(m => m.name === 'Chen').online)
c = await connect(chen, code)
await until(a, r => r.members.find(m => m.name === 'Chen').online)
await wait(300)
send(a, { t: 'abort' })
await until(a, r => r.phase === 'lobby')
await wait(800)
for (const ws of [a, b, c]) ws.close(1000)

const r = await (await fetch(BASE + '/internal/analytics?days=30', { headers: { 'x-internal-key': KEY } })).json()
const expect = [
  ['visitors today', r.acquisition.dau, 4], ['new visitors', r.acquisition.newVisitors, 4], ['players today', r.acquisition.dauPlayers, 3],
  ['from Google', r.acquisition.sources.find(s => s.label === 'Google')?.n, 1], ['from a room link', r.acquisition.sources.find(s => s.label === 'Room link')?.n, 1],
  ['from Instagram', r.acquisition.sources.find(s => s.label === 'Instagram')?.n, 1], ['from Bing', r.acquisition.sources.find(s => s.label === 'Bing')?.n, 1],
  ['rooms created', r.activation.created, 1], ['rooms started', r.activation.started, 1], ['activation', r.activation.rate, 1], ['players per room', r.activation.avgPlayers, 3],
  ['games', r.engagement.games, 2], ['finished', r.engagement.done, 1], ['completed', r.engagement.completed, 0.5], ['2nd game', r.engagement.second, 1], ['3rd game', r.engagement.third, 0],
  ['everyone read the rules', r.engagement.rulesSkipped, 1],
  ['funnel: played', r.funnel.played, 3], ['invites shared', r.virality.shares, 1], ['new from invites', r.virality.newFromInvites, 1], ['rooms by referred', r.virality.roomsByReferred, 0],
  ['drops', r.quality.dropped, 1], ['seats', r.quality.seats, 6], ['reconnects', r.quality.reconnect, 1], ['aborted', r.quality.aborted, 0.5],
  ['ratings', r.feedback.ratings, 2], ['average rating', r.feedback.avgRating, 3], ['again', r.feedback.again, 0.5],
  ['ideas', r.feedback.ideas[0]?.text, 'More India questions'], ['complaints', r.feedback.complaints[0]?.text, 'Timer too short'],
]
let bad = 0
for (const [label, got, want] of expect) {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ` (expected ${want})`}`)
}
process.exitCode = bad ? 1 : 0
