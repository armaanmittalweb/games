// Plays every game to the end with bots, at several table sizes, with players joining and leaving midway, and checks
// that each game ends with sane standings and never throws. Run: npm test
import { GAMES } from '../src/games'
import { CATALOG, settings } from '../src/catalog'
import { checkContent } from './content'
import { checkAnalytics } from './analytics'
import { checkPoints } from './points'
import { dealAt, rng, type Ctx, type Standing } from '../src/engine'

const r = rng()
let failures = 0

function play(id: string, n: number, config: Record<string, string | number>, label: string) {
  const game = GAMES[id]
  const players = Array.from({ length: n }, (_, i) => `p${i + 1}`)
  const names: Record<string, string> = Object.fromEntries(players.map(p => [p, p.toUpperCase()]))
  const online = new Set(players)
  const inst = { wake: 0 }
  let now = 1_700_000_000_000
  let ended: { standings: Standing[]; summary?: unknown } | null = null
  const blobs = new Map<string, unknown>()
  const decks: Record<string, number> = {}
  const ctx = (): Ctx => ({
    now, config, players, names, colors: {}, online, host: players[0], ...r,
    deal: (key, items, n) => { const at = decks[key] ?? r.int(1000); decks[key] = at + n; return dealAt(key, items, n, at) },
    wake: at => { inst.wake = at },
    end: (standings, summary) => { if (ended) throw new Error('ended twice'); ended = { standings, summary } },
    emit: () => {}, quiet: () => {}, lazy: () => {},
    put: (k, v) => { blobs.set(k, JSON.parse(JSON.stringify(v))) }, get: <T>(k: string) => blobs.get(k) as T | undefined,
  })
  const fail = (msg: string) => { failures++; console.log(`FAIL ${label}: ${msg}`) }
  try {
    const s = game.setup(ctx())
    let steps = 0, acts = 0, joined = false, left = false, back = false, gone = ''
    while (!ended && steps++ < 30_000) {
      for (const p of r.shuffle(players.slice())) {
        if (ended) break
        if (!online.has(p)) continue
        const m = game.bot?.(ctx(), s, p)
        if (m && r.rand() < 0.7) { game.act(ctx(), s, p, m); acts++ }
      }
      if (ended) break
      for (const p of [...players, 'watcher']) JSON.stringify(game.view(ctx(), s, p))
      // Someone arrives a third of the way in: once play is under way they only watch (a game may still seat them
      // during its own setup). Later someone's line drops; half the time it comes back and they carry on in their seat,
      // half the time the host removes them.
      if (!joined && steps === 40 && players.length < 30) {
        joined = true
        const id = `p${players.length + 1}`
        names[id] = id.toUpperCase()
        if (game.join?.(ctx(), s, id)) { players.push(id); online.add(id) }
      }
      if (!left && steps === 90 && players.length > 3) {
        left = true
        gone = players[1]
        online.delete(gone)
        if (r.rand() < 0.5) { game.leave?.(ctx(), s, gone); gone = '' }
      }
      if (!back && gone && steps === 140) { back = true; online.add(gone) }
      now += 300 + r.int(900)
      if (inst.wake && (now >= inst.wake || r.rand() < 0.05)) now = Math.max(now, inst.wake)
      if (inst.wake && now >= inst.wake) { inst.wake = 0; game.tick?.(ctx(), s) }
      else if (!inst.wake && steps % 50 === 0 && acts === 0) break
    }
    if (!ended) return fail(`did not end after ${steps} steps (${acts} actions)`)
    const e = ended as { standings: Standing[] }
    const ids = e.standings.map(x => x.id).sort()
    const missing = players.filter(p => !ids.includes(p) && online.has(p))
    if (missing.length) fail(`standings miss ${missing}`)
    if (!e.standings.some(x => x.place === 1)) fail('nobody placed first')
    if (e.standings.some(x => !(x.place >= 1 && x.place <= e.standings.length))) fail('bad place')
    JSON.stringify(ended)
    console.log(`ok   ${label}: ${steps} steps, ${acts} actions, winner ${e.standings.filter(x => x.place === 1).map(x => x.id)}`)
  } catch (err) {
    fail((err as Error).stack ?? String(err))
  }
}

const only = process.argv[2]
for (const meta of CATALOG) {
  if (only && meta.id !== only) continue
  const sizes = [...new Set([meta.min, Math.max(meta.min, 3), Math.max(meta.min, 5), Math.min(meta.max, 8)])]
  for (const n of sizes) {
    play(meta.id, n, settings(meta.id, {}), `${meta.id} x${n}`)
    play(meta.id, n, settings(meta.id, meta.night), `${meta.id} x${n} night`)
  }
  for (const o of meta.options.filter(o => o.kind === 'choice')) {
    for (const [v] of o.choices!) play(meta.id, Math.max(meta.min, 4), settings(meta.id, { ...meta.night, [o.key]: v }), `${meta.id} ${o.key}=${v}`)
  }
}
if (!only) failures += checkContent() + checkAnalytics() + checkPoints()
console.log(failures ? `${failures} failures` : 'all games ended cleanly')
process.exitCode = failures ? 1 : 0
