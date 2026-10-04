// Word Grid: find words in a grid of letters by chaining neighbouring squares, Boggle-style.
import { rank, type Ctx, type Game } from '../engine'
import { DICT } from '../words'

interface C { size: number; minutes: number; scoring: 'unique' | 'all' }
interface S {
  size: number
  grid: string[] // one face per square; "qu" is one square
  startsAt: number
  endsAt: number
  found: Record<string, string[]>
  over: boolean
}

// The classic 16 dice and the 25 of the big version. "Q" is printed as "Qu".
const DICE4 = ['AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS', 'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY', 'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW', 'EIOSST', 'ELRTTY', 'HIMNUQ', 'HLNNRZ']
const DICE5 = ['AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM', 'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCENST', 'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR', 'DHLNOR', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU', 'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU']
const COUNTDOWN_MS = 3000

export const minLen = (size: number) => (size === 5 ? 4 : 3)
export const points = (w: string) => w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11

/** Whether a word can be traced on the grid without reusing a square. */
export function onGrid(grid: string[], size: number, word: string) {
  const used = new Array(grid.length).fill(false)
  const walk = (at: number, pos: number): boolean => {
    const face = grid[at]
    if (!word.startsWith(face, pos)) return false
    const end = pos + face.length
    if (end === word.length) return true
    used[at] = true
    const r = Math.floor(at / size), c = at % size
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc
      if ((dr || dc) && nr >= 0 && nc >= 0 && nr < size && nc < size && !used[nr * size + nc] && walk(nr * size + nc, end)) { used[at] = false; return true }
    }
    used[at] = false
    return false
  }
  for (let i = 0; i < grid.length; i++) if (walk(i, 0)) return true
  return false
}

/** Every dictionary word on the grid. */
export function solve(grid: string[], size: number) {
  const letters = new Set(grid.join(''))
  const min = minLen(size)
  return [...DICT].filter(w => w.length >= min && w.length <= grid.length + 4 && [...w].every(ch => letters.has(ch)) && onGrid(grid, size, w))
}

function roll(g: Ctx<C>, size: number) {
  const dice = g.shuffle((size === 5 ? DICE5 : DICE4).slice())
  return dice.map(d => { const f = d[g.int(6)].toLowerCase(); return f === 'q' ? 'qu' : f })
}

function scores(g: Ctx<C>, s: S) {
  const count = new Map<string, number>()
  for (const id of g.players) for (const w of s.found[id] ?? []) count.set(w, (count.get(w) ?? 0) + 1)
  const pts: Record<string, number> = {}
  for (const id of g.players) {
    pts[id] = (s.found[id] ?? []).reduce((a, w) => a + (g.config.scoring === 'all' || count.get(w) === 1 ? points(w) : 0), 0)
  }
  return { pts, count }
}

export const wordgrid: Game<S, C> = {
  setup(g) {
    const size = Number(g.config.size) === 5 ? 5 : 4
    // Re-roll the rare grid with almost nothing in it.
    let grid = roll(g, size)
    for (let i = 0; i < 6 && solve(grid, size).length < (size === 5 ? 60 : 30); i++) grid = roll(g, size)
    const startsAt = g.now + COUNTDOWN_MS
    const s: S = { size, grid, startsAt, endsAt: startsAt + g.config.minutes * 60_000, found: {}, over: false }
    // The grid is sent when the countdown ends.
    g.wake(s.startsAt)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    if (m.a !== 'word') return
    if (g.now < s.startsAt) return 'Wait for the countdown'
    if (g.now >= s.endsAt) return 'Time is up'
    const w = String(m.w ?? '').toLowerCase().replace(/[^a-z]/g, '')
    if (w.length < minLen(s.size)) return `At least ${minLen(s.size)} letters`
    const mine = (s.found[id] ??= [])
    if (mine.includes(w)) return 'You already have that one'
    if (!onGrid(s.grid, s.size, w)) return 'Not on the grid'
    if (!DICT.has(w)) return 'Not in the dictionary'
    mine.push(w)
  },
  tick(g, s) {
    if (g.now < s.endsAt) return g.wake(s.endsAt)
    s.over = true
    const { pts, count } = scores(g, s)
    const all = solve(s.grid, s.size)
    const foundAny = new Set([...count.keys()])
    const missed = all.filter(w => !foundAny.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 12)
    g.end(rank(g.players.map(id => ({ id })), t => [-pts[t.id], -(s.found[t.id]?.length ?? 0)], t => pts[t.id], t => `${s.found[t.id]?.length ?? 0} words`), {
      grid: s.grid, size: s.size, total: all.length, missed,
      words: Object.fromEntries(g.players.map(id => [id, (s.found[id] ?? []).map(w => ({ w, pts: points(w), shared: (count.get(w) ?? 0) > 1 }))])),
      scoring: g.config.scoring,
    })
  },
  view(g, s, id) {
    return {
      size: s.size, grid: g.now >= s.startsAt ? s.grid : null, startsAt: s.startsAt, endsAt: s.endsAt, min: minLen(s.size),
      mine: s.found[id] ?? [], counts: Object.fromEntries(g.players.map(p => [p, s.found[p]?.length ?? 0])),
    }
  },
  bot(g, s, id) {
    if (g.now < s.startsAt || g.now >= s.endsAt) return null
    const all = solve(s.grid, s.size)
    return all.length ? { a: 'word', w: g.pick(all) } : null
  },
}
