// Territory: a shared grid. Each turn every player secretly picks one free square next to their land; all picks are
// shown at once. A square two players picked stays free. A free area that only one player borders becomes theirs.
// Most squares at the end wins.
import { rank, type Ctx, type Game } from '../engine'
import { active } from './util'

interface C { seconds: number; size: string }
interface S {
  w: number
  h: number
  /** Per square: -2 rock, -1 free, otherwise the owner's seat (index into players). */
  cells: number[]
  turn: number
  maxTurns: number
  until: number
  picks: Record<string, number>
  /** What happened last turn, for the page to show. */
  last: { won: [number, number][]; clash: number[]; walled: [number, number][] }
  seats: string[]
}

const SIZES: Record<string, number[]> = { small: [7, 9, 10, 11, 11, 12, 12, 13], normal: [9, 11, 12, 13, 13, 14, 15, 15], big: [11, 13, 14, 15, 16, 17, 18, 18] }

const around = (s: S, i: number) => {
  const x = i % s.w, y = (i / s.w) | 0, out: number[] = []
  if (x > 0) out.push(i - 1)
  if (x < s.w - 1) out.push(i + 1)
  if (y > 0) out.push(i - s.w)
  if (y < s.h - 1) out.push(i + s.w)
  return out
}

/** Free squares next to a player's land. */
export function moves(s: S, seat: number) {
  const out = new Set<number>()
  s.cells.forEach((c, i) => { if (c === seat) for (const j of around(s, i)) if (s.cells[j] === -1) out.add(j) })
  return [...out]
}

/** Gives every free area bordered by just one player to that player. */
function wall(s: S): [number, number][] {
  const seen = new Uint8Array(s.cells.length)
  const got: [number, number][] = []
  for (let i = 0; i < s.cells.length; i++) {
    if (s.cells[i] !== -1 || seen[i]) continue
    const area: number[] = [], owners = new Set<number>(), stack = [i]
    seen[i] = 1
    while (stack.length) {
      const k = stack.pop()!
      area.push(k)
      for (const j of around(s, k)) {
        const c = s.cells[j]
        if (c === -1 && !seen[j]) { seen[j] = 1; stack.push(j) }
        else if (c >= 0) owners.add(c)
      }
    }
    if (owners.size === 1) {
      const o = [...owners][0]
      for (const k of area) { s.cells[k] = o; got.push([k, o]) }
    }
  }
  return got
}

function next(g: Ctx<C>, s: S) {
  s.picks = {}
  s.turn++
  // Players who have left do not hold the game up.
  const anyMove = active(g).some(id => moves(s, s.seats.indexOf(id)).length > 0)
  if (!anyMove || s.turn > s.maxTurns) return finish(g, s)
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function resolve(g: Ctx<C>, s: S) {
  const by = new Map<number, string[]>()
  for (const [id, cell] of Object.entries(s.picks)) by.set(cell, [...(by.get(cell) ?? []), id])
  s.last = { won: [], clash: [], walled: [] }
  for (const [cell, ids] of by) {
    if (ids.length > 1) s.last.clash.push(cell)
    else { const seat = s.seats.indexOf(ids[0]); s.cells[cell] = seat; s.last.won.push([cell, seat]) }
  }
  s.last.walled = wall(s)
  next(g, s)
}

function counts(s: S) {
  const n: Record<string, number> = {}
  s.seats.forEach(id => { n[id] = 0 })
  for (const c of s.cells) if (c >= 0) n[s.seats[c]]++
  return n
}

function finish(g: Ctx<C>, s: S) {
  const n = counts(s)
  const total = s.cells.filter(c => c !== -2).length
  g.end(rank(g.players.map(id => ({ id })), t => [-(n[t.id] ?? 0)], t => n[t.id] ?? 0, t => `${Math.round(((n[t.id] ?? 0) / total) * 100)}% of the land`))
}

export const territory: Game<S, C> = {
  setup(g) {
    const n = g.players.length
    const side = (SIZES[g.config.size] ?? SIZES.normal)[Math.min(n, 8) - 1]
    const s: S = { w: side, h: side, cells: Array(side * side).fill(-1), turn: 0, maxTurns: 0, until: 0, picks: {}, last: { won: [], clash: [], walled: [] }, seats: g.players.slice() }
    // Rocks: about one square in twelve, never in the middle ring where people start.
    for (let i = 0; i < s.cells.length; i++) if (g.rand() < 1 / 12) s.cells[i] = -2
    // Starting squares on a circle around the middle, evenly spaced, at a random turn of the circle.
    const r = (side - 1) / 2 - (n > 2 ? 1 : 1.5), c = (side - 1) / 2, spin = g.rand() * Math.PI * 2
    g.shuffle(s.seats.map((_, i) => i)).forEach((seat, k) => {
      const a = spin + (k / n) * Math.PI * 2
      const x = Math.round(c + r * Math.cos(a)), y = Math.round(c + r * Math.sin(a))
      const i = y * side + x
      s.cells[i] = seat
      for (const j of around(s, i)) if (s.cells[j] === -2) s.cells[j] = -1
    })
    s.maxTurns = Math.ceil((side * side) / Math.max(1, n)) + 10
    next(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a !== 'pick') return
    const seat = s.seats.indexOf(id)
    const cell = Number(m.cell)
    if (seat < 0 || !moves(s, seat).includes(cell)) return 'Pick a free square next to your land'
    s.picks[id] = cell
    // Everyone who can still move has picked: play the turn now.
    const can = active(g).filter(p => moves(s, s.seats.indexOf(p)).length > 0)
    if (can.every(p => s.picks[p] !== undefined)) resolve(g, s)
  },
  tick(g, s) { resolve(g, s) },
  leave(g, s, id) { delete s.picks[id] },
  view(g, s, id) {
    const seat = s.seats.indexOf(id)
    return {
      w: s.w, h: s.h, cells: s.cells, seats: s.seats, turn: s.turn, until: s.until, last: s.last,
      mine: s.picks[id] ?? null, picked: Object.keys(s.picks), moves: seat >= 0 ? moves(s, seat) : [], counts: counts(s),
    }
  },
  bot(g, s, id) {
    const seat = s.seats.indexOf(id)
    if (seat < 0 || s.picks[id] !== undefined) return null
    const m = moves(s, seat)
    return m.length ? { a: 'pick', cell: g.pick(m) } : null
  },
}
