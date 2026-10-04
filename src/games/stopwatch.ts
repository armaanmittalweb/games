// Stop the Clock: start a hidden stopwatch, stop it when you feel the target time has passed. Nobody sees a running
// clock; your real time is shown only after you stop. Each browser times its own run between its Start and Stop taps,
// so lag does not change anyone's result.
import { rank, type Ctx, type Game } from '../engine'
import { PLACE, allIn } from './util'

interface C { rounds: number }
interface S {
  targets: number[] // ms
  round: number
  phase: 'run' | 'result'
  openAt: number // Start works from here
  until: number
  stops: Record<string, number> // ms between the player's Start and Stop
  gained: Record<string, number>
  pts: Record<string, number>
  off: Record<string, number> // summed distance from the target, for tie-breaks
  best: Record<string, number>
}

const READY_MS = 2500 // the target is on screen before Start works
const WINDOW_MS = 12_000 // time to start, on top of the target itself
const RESULT_MS = 7000
export const PERFECT_MS = 10 // within a hundredth of a second

function open(g: Ctx<C>, s: S) {
  s.phase = 'run'
  s.openAt = g.now + READY_MS
  s.until = s.openAt + s.targets[s.round] + WINDOW_MS
  s.stops = {}
  s.gained = {}
  g.wake(s.until)
}

function close(g: Ctx<C>, s: S) {
  const target = s.targets[s.round]
  const rows = Object.entries(s.stops).map(([id, ms]) => ({ id, d: Math.abs(ms - target) })).sort((a, b) => a.d - b.d)
  let place = 0
  rows.forEach((r, i) => {
    if (i === 0 || r.d !== rows[i - 1].d) place = i + 1
    s.gained[r.id] = (PLACE[place - 1] ?? 1) + (r.d <= PERFECT_MS ? 3 : 0)
    s.pts[r.id] = (s.pts[r.id] ?? 0) + s.gained[r.id]
    s.off[r.id] = (s.off[r.id] ?? 0) + r.d
    s.best[r.id] = Math.min(s.best[r.id] ?? Infinity, r.d)
  })
  // Not stopping counts as the target itself off, for the tie-break.
  for (const id of g.players) if (s.stops[id] === undefined) s.off[id] = (s.off[id] ?? 0) + target
  s.phase = 'result'
  s.until = g.now + RESULT_MS
  g.wake(s.until)
}

export const stopwatch: Game<S, C> = {
  setup(g) {
    const n = g.config.rounds
    // Targets from 3.00 s to 12.00 s in hundredths, a little longer on average as the rounds go on.
    const targets = Array.from({ length: n }, (_, i) => Math.round(300 + (i / Math.max(1, n - 1)) * 500 + g.int(400)) * 10)
    const s: S = { targets, round: 0, phase: 'run', openAt: 0, until: 0, stops: {}, gained: {}, pts: {}, off: {}, best: {} }
    open(g, s)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    if (m.a !== 'stop' || s.phase !== 'run' || s.stops[id] !== undefined) return
    const ms = Math.round(Number(m.ms))
    // A run can never be longer than the time since Start began to work (plus a little for clock drift).
    if (!(ms >= 0 && ms <= g.now - s.openAt + 400)) return 'That stop did not add up. Wait for the next round'
    s.stops[id] = ms
    if (allIn(g, s.stops)) close(g, s)
  },
  tick(g, s) {
    if (s.phase === 'run') return close(g, s)
    if (s.round + 1 >= s.targets.length) {
      return g.end(rank(g.players.map(id => ({ id })), t => [-(s.pts[t.id] ?? 0), s.off[t.id] ?? 1e9], t => s.pts[t.id] ?? 0,
        t => (s.best[t.id] !== undefined ? `closest: ${(s.best[t.id] / 1000).toFixed(3)} s off` : 'never stopped')))
    }
    s.round++
    open(g, s)
  },
  view(g, s) {
    return {
      round: s.round, rounds: s.targets.length, target: s.targets[s.round], phase: s.phase, openAt: s.openAt, until: s.until,
      stopped: Object.keys(s.stops), stops: s.phase === 'result' ? s.stops : {}, gained: s.gained, pts: s.pts, perfect: PERFECT_MS,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'run' || s.stops[id] !== undefined || g.now < s.openAt) return null
    const target = s.targets[s.round]
    return { a: 'stop', ms: Math.min(g.now - s.openAt, Math.max(0, target - 1500 + g.int(3000))) }
  },
}
