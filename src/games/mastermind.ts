// Mastermind: everyone cracks the same secret colour code. Each guess shows how many pegs are the right colour in the
// right place, and how many are the right colour in the wrong place. Fewest guesses wins the code; speed breaks ties.
import { rank, type Ctx, type Game } from '../engine'
import { PLACE, allIn } from './util'

interface C { rounds: number; seconds: number; colors: number; pegs: number; repeats: string }
interface Guess { pegs: number[]; exact: number; near: number }
interface S {
  codes: number[][]
  round: number
  phase: 'play' | 'reveal'
  opened: number
  until: number
  guesses: Record<string, Guess[]>
  /** When each player finished the round (cracked it or used every guess), ms from the start. */
  done: Record<string, number>
  gained: Record<string, number>
  pts: Record<string, number>
  cracked: Record<string, number>
  used: Record<string, number>
}

export const MAX_GUESSES = 10
const REVEAL_MS = 7000

/** Right colour in the right place, and right colour in the wrong place. */
export function score(code: number[], guess: number[]) {
  let exact = 0
  const a: Record<number, number> = {}, b: Record<number, number> = {}
  code.forEach((c, i) => {
    if (guess[i] === c) exact++
    else { a[c] = (a[c] ?? 0) + 1; b[guess[i]] = (b[guess[i]] ?? 0) + 1 }
  })
  let near = 0
  for (const k of Object.keys(a)) near += Math.min(a[+k], b[+k] ?? 0)
  return { exact, near }
}

function makeCode(g: Ctx<C>): number[] {
  const { colors, pegs } = g.config
  if (g.config.repeats === 'yes') return Array.from({ length: pegs }, () => g.int(colors))
  return g.shuffle(Array.from({ length: colors }, (_, i) => i)).slice(0, pegs)
}

function open(g: Ctx<C>, s: S) {
  s.phase = 'play'
  s.guesses = {}
  s.done = {}
  s.gained = {}
  s.opened = g.now
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const code = s.codes[s.round]
  const solvers = Object.keys(s.done).filter(id => s.guesses[id]?.some(x => x.exact === code.length))
    .sort((a, b) => s.guesses[a].length - s.guesses[b].length || s.done[a] - s.done[b])
  solvers.forEach((id, i) => {
    const same = i > 0 && s.guesses[id].length === s.guesses[solvers[i - 1]].length && s.done[id] === s.done[solvers[i - 1]]
    s.gained[id] = same ? s.gained[solvers[i - 1]] : PLACE[i] ?? 1
    s.pts[id] = (s.pts[id] ?? 0) + s.gained[id]
    s.cracked[id] = (s.cracked[id] ?? 0) + 1
  })
  for (const id of g.players) s.used[id] = (s.used[id] ?? 0) + (s.guesses[id]?.length ?? 0)
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const mastermind: Game<S, C> = {
  setup(g) {
    const s: S = {
      codes: Array.from({ length: g.config.rounds }, () => makeCode(g)), round: 0, phase: 'play', opened: 0, until: 0,
      guesses: {}, done: {}, gained: {}, pts: {}, cracked: {}, used: {},
    }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a !== 'guess' || s.phase !== 'play' || s.done[id] !== undefined) return
    const { colors, pegs } = g.config
    const p = Array.isArray(m.pegs) ? m.pegs.map(Number) : []
    if (p.length !== pegs || p.some(x => !Number.isInteger(x) || x < 0 || x >= colors)) return `Pick ${pegs} colours`
    if (g.config.repeats !== 'yes' && new Set(p).size !== p.length) return 'Each colour only once in this game'
    const list = (s.guesses[id] ??= [])
    const r = score(s.codes[s.round], p)
    list.push({ pegs: p, ...r })
    if (r.exact === pegs || list.length >= MAX_GUESSES) s.done[id] = g.now - s.opened
    if (allIn(g, s.done)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'play') return reveal(g, s)
    if (s.round + 1 >= s.codes.length) {
      return g.end(rank(g.players.map(id => ({ id })), t => [-(s.pts[t.id] ?? 0), s.used[t.id] ?? 0], t => s.pts[t.id] ?? 0,
        t => `${s.cracked[t.id] ?? 0}/${s.codes.length} cracked · ${s.used[t.id] ?? 0} guesses`))
    }
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const reveal = s.phase === 'reveal'
    return {
      round: s.round, rounds: s.codes.length, phase: s.phase, until: s.until, colors: g.config.colors, pegs: g.config.pegs,
      repeats: g.config.repeats === 'yes', max: MAX_GUESSES, mine: s.guesses[id] ?? [], finished: s.done[id] !== undefined,
      // Others: how far along they are, never their guesses (until the reveal).
      progress: Object.fromEntries(g.players.map(p => [p, { n: s.guesses[p]?.length ?? 0, cracked: s.guesses[p]?.some(x => x.exact === g.config.pegs) ?? false }])),
      done: Object.keys(s.done), pts: s.pts,
      code: reveal ? s.codes[s.round] : null, gained: reveal ? s.gained : null,
      all: reveal ? Object.fromEntries(g.players.map(p => [p, s.guesses[p] ?? []])) : null,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'play' || s.done[id] !== undefined || g.rand() < 0.4) return null
    const { colors, pegs } = g.config
    // A guess consistent with everything seen so far, when one turns up quickly; otherwise any guess.
    const seen = s.guesses[id] ?? []
    for (let k = 0; k < 400; k++) {
      const c = g.config.repeats === 'yes' ? Array.from({ length: pegs }, () => g.int(colors)) : g.shuffle(Array.from({ length: colors }, (_, i) => i)).slice(0, pegs)
      if (seen.every(x => { const r = score(c, x.pegs); return r.exact === x.exact && r.near === x.near })) return { a: 'guess', pegs: c }
    }
    return { a: 'guess', pegs: g.shuffle(Array.from({ length: colors }, (_, i) => i)).slice(0, pegs) }
  },
}
