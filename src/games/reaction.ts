// Reaction: wait for the signal, tap first. The browser times the tap from the moment it showed the signal.
import { rank, type Ctx, type Game } from '../engine'
import { PLACE, allIn } from './util'

interface C { rounds: number }
type Kind = 'green' | 'decoy' | 'target'
interface S {
  kinds: Kind[]
  round: number
  phase: 'wait' | 'result'
  goAt: number
  decoys: { at: number; color: string }[]
  pos: { x: number; y: number }
  taps: Record<string, number> // ms, or -1 for a false start
  gained: Record<string, number>
  pts: Record<string, number>
  best: Record<string, number>
  until: number
}

const LEAD_MS = 2200 // "get ready" before the random wait starts
const LATE_MS = 2500 // how long after the signal a round stays open
const RESULT_MS = 4000
const DECOY_COLORS = ['#3b82f6', '#eab308', '#a855f7', '#f97316', '#ec4899']

function open(g: Ctx<C>, s: S) {
  const kind = s.kinds[s.round]
  const wait = 1500 + g.int(3500)
  const start = g.now + LEAD_MS
  s.phase = 'wait'
  s.goAt = start + wait
  s.decoys = []
  if (kind === 'decoy') {
    const n = 1 + g.int(3)
    for (let i = 0; i < n; i++) s.decoys.push({ at: start + Math.round((wait * (i + 1)) / (n + 1)), color: g.pick(DECOY_COLORS) })
  }
  s.pos = { x: 10 + g.int(80), y: 15 + g.int(70) }
  s.taps = {}
  s.gained = {}
  s.until = s.goAt + LATE_MS
  g.wake(s.until)
}

function close(g: Ctx<C>, s: S) {
  const ok = Object.entries(s.taps).filter(([, ms]) => ms >= 0).sort((a, b) => a[1] - b[1])
  let place = 0
  ok.forEach(([id, ms], i) => {
    if (i === 0 || ms !== ok[i - 1][1]) place = i + 1
    s.gained[id] = PLACE[place - 1] ?? 1
    s.pts[id] = (s.pts[id] ?? 0) + s.gained[id]
    s.best[id] = Math.min(s.best[id] ?? Infinity, ms)
  })
  s.phase = 'result'
  s.until = g.now + RESULT_MS
  g.wake(s.until)
}

export const reaction: Game<S, C> = {
  setup(g) {
    const kinds: Kind[] = []
    for (let i = 0; i < g.config.rounds; i++) kinds.push(i === 0 ? 'green' : g.pick<Kind>(['green', 'decoy', 'decoy', 'target', 'target']))
    const s: S = { kinds, round: 0, phase: 'wait', goAt: 0, decoys: [], pos: { x: 50, y: 50 }, taps: {}, gained: {}, pts: {}, best: {}, until: 0 }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    if (s.phase !== 'wait' || s.taps[id] !== undefined) return
    if (m.a === 'false' || g.now < s.goAt - 40) s.taps[id] = -1
    else if (m.a === 'tap') {
      const ms = Math.round(Number(m.ms))
      if (!(ms >= 0 && ms <= LATE_MS + 1000)) return
      s.taps[id] = ms
    } else return
    if (allIn(g, s.taps)) close(g, s)
  },
  /** Someone's phone went: if everyone still here has played, the round need not wait for them. */
  away(g, s) { if (s.phase === 'wait' && allIn(g, s.taps)) close(g, s) },
  tick(g, s) {
    if (s.phase === 'wait') return close(g, s)
    if (s.round + 1 >= s.kinds.length) {
      return g.end(rank(g.players.map(id => ({ id })), t => [-(s.pts[t.id] ?? 0), s.best[t.id] ?? 1e9], t => s.pts[t.id] ?? 0,
        t => s.best[t.id] !== undefined ? `best ${s.best[t.id]} ms` : 'no clean taps'))
    }
    s.round++
    open(g, s)
  },
  view(g, s) {
    return {
      round: s.round, rounds: s.kinds.length, kind: s.kinds[s.round], phase: s.phase, goAt: s.goAt, decoys: s.decoys, pos: s.pos,
      lead: LEAD_MS, tapped: Object.keys(s.taps), taps: s.phase === 'result' ? s.taps : {}, gained: s.gained, pts: s.pts, until: s.until,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'wait' || s.taps[id] !== undefined || g.now < s.goAt) return null
    return { a: 'tap', ms: 180 + g.int(200) }
  },
}
