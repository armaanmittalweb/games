// 24 Game: four numbers; combine them with + − × ÷ to make 24. Everyone races on the same hand.
import { rank, type Ctx, type Game } from '../engine'
import { HANDS, type Hand } from '../content/make24'
import { PLACE, allIn } from './util'

interface C { rounds: number; seconds: number; level: string }
interface S {
  hands: Hand[]
  round: number
  phase: 'play' | 'reveal'
  opened: number
  until: number
  /** When each player made 24 this round, in ms from the start of the round. */
  solved: Record<string, number>
  gained: Record<string, number>
  pts: Record<string, number>
  wins: Record<string, number>
  times: Record<string, number[]>
}

const REVEAL_MS = 6000
type Frac = [number, number]

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))
const fr = (n: number, d: number): Frac => { if (d < 0) { n = -n; d = -d } const g = gcd(n, d) || 1; return [n / g, d / g] }
const OPS: Record<string, (a: Frac, b: Frac) => Frac | null> = {
  '+': (a, b) => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]),
  '-': (a, b) => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]),
  '×': (a, b) => fr(a[0] * b[0], a[1] * b[1]),
  '÷': (a, b) => (b[0] === 0 ? null : fr(a[0] * b[1], a[1] * b[0])),
}

/**
 * Plays a list of steps on the hand. Each step takes two numbers from the list (by position), puts the result at the
 * end, and the last number left must be 24. The page uses the same rule, so positions match.
 */
export function check(nums: number[], steps: unknown): string | null {
  if (!Array.isArray(steps) || steps.length !== 3) return 'Use all four numbers'
  let list: Frac[] = nums.map(n => [n, 1])
  for (const st of steps) {
    const { a, o, b } = (st ?? {}) as { a?: unknown; o?: unknown; b?: unknown }
    const i = Number(a), j = Number(b)
    if (!Number.isInteger(i) || !Number.isInteger(j) || i === j || i < 0 || j < 0 || i >= list.length || j >= list.length) return 'That step does not fit'
    const f = OPS[String(o)]
    if (!f) return 'Use + − × ÷'
    const v = f(list[i], list[j])
    if (!v) return 'You cannot divide by zero'
    list = [...list.filter((_, k) => k !== i && k !== j), v]
  }
  const [n, d] = list[0]
  if (n === 24 && d === 1) return null
  return `That makes ${d === 1 ? n : `${n}/${d}`}, not 24`
}

function open(g: Ctx<C>, s: S) {
  s.phase = 'play'
  s.solved = {}
  s.gained = {}
  s.opened = g.now
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const order = Object.entries(s.solved).sort((a, b) => a[1] - b[1])
  order.forEach(([id, ms], i) => {
    s.gained[id] = PLACE[i] ?? 1
    s.pts[id] = (s.pts[id] ?? 0) + s.gained[id]
    ;(s.times[id] ??= []).push(ms)
    if (i === 0) s.wins[id] = (s.wins[id] ?? 0) + 1
  })
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

const levelOf = (c: C) => (c.level === 'easy' ? 1 : c.level === 'hard' ? 3 : c.level === 'medium' ? 2 : 0)

export const make24: Game<S, C> = {
  setup(g) {
    const l = levelOf(g.config)
    const pool = l ? HANDS.filter(h => h[4] === l) : HANDS.filter(h => h[4] < 3)
    const hands = g.deal(`make24:${g.config.level}`, pool, g.config.rounds).map(h => {
      // The same hand in a new order each time it comes round.
      const n = g.shuffle(h.slice(0, 4) as number[])
      return [n[0], n[1], n[2], n[3], h[4], h[5]] as Hand
    })
    const s: S = { hands, round: 0, phase: 'play', opened: 0, until: 0, solved: {}, gained: {}, pts: {}, wins: {}, times: {} }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a !== 'solve' || s.phase !== 'play' || s.solved[id] !== undefined) return
    const err = check(s.hands[s.round].slice(0, 4) as number[], m.steps)
    if (err) return err
    s.solved[id] = g.now - s.opened
    if (allIn(g, s.solved)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'play') return reveal(g, s)
    if (s.round + 1 >= s.hands.length) {
      const avg = (id: string) => { const t = s.times[id] ?? []; return t.length ? t.reduce((a, b) => a + b, 0) / t.length : Infinity }
      return g.end(rank(g.players.map(id => ({ id })), t => [-(s.pts[t.id] ?? 0), avg(t.id)], t => s.pts[t.id] ?? 0,
        t => `${(s.times[t.id] ?? []).length}/${s.hands.length} solved${s.times[t.id]?.length ? ` · ${(avg(t.id) / 1000).toFixed(1)} s avg` : ''}`))
    }
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const h = s.hands[s.round]
    return {
      round: s.round, rounds: s.hands.length, nums: h.slice(0, 4), level: h[4], phase: s.phase, until: s.until, opened: s.opened,
      mine: s.solved[id] ?? null, solved: Object.keys(s.solved), pts: s.pts,
      answer: s.phase === 'reveal' ? h[5] : null, gained: s.phase === 'reveal' ? s.gained : null,
      times: s.phase === 'reveal' ? s.solved : null,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'play' || s.solved[id] !== undefined || g.rand() < 0.5) return null
    // Bots find an answer by trying every way.
    return { a: 'solve', steps: stepsFor(s.hands[s.round]) }
  },
}

/** One way to make 24 from the hand, as steps the page would send (for bots and tests). */
export function stepsFor(h: Hand): { a: number; o: string; b: number }[] {
  const go = (list: Frac[], steps: { a: number; o: string; b: number }[]): typeof steps | null => {
    if (list.length === 1) return list[0][0] === 24 && list[0][1] === 1 ? steps : null
    for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
      if (i === j) continue
      for (const [o, f] of Object.entries(OPS)) {
        const v = f(list[i], list[j])
        if (!v) continue
        const r = go([...list.filter((_, k) => k !== i && k !== j), v], [...steps, { a: i, o, b: j }])
        if (r) return r
      }
    }
    return null
  }
  return go((h.slice(0, 4) as number[]).map(n => [n, 1] as Frac), []) ?? []
}
