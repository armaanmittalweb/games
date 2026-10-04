// Liar's Dice: secret dice, rising bids on the whole table, and calls of "liar".
import type { Ctx, Game, Standing } from '../engine'

interface C { dice: number; wild: 'on' | 'off'; turnSeconds: number }
interface Bid { q: number; f: number; by: string }
interface S {
  alive: string[] // seat order
  dice: Record<string, number[]>
  turn: number
  bid: Bid | null
  bids: Bid[]
  phase: 'bid' | 'show'
  until: number
  call: { by: string; bid: Bid; actual: number; loser: string; auto: boolean } | null
  out: string[] // first out first
  round: number
}

const SHOW_MS = 7000

const wild = (g: Ctx<C>) => g.config.wild === 'on'
const total = (s: S) => s.alive.reduce((a, id) => a + s.dice[id].length, 0)
const minFace = (g: Ctx<C>) => (wild(g) ? 2 : 1)

function roll(g: Ctx<C>, s: S) {
  for (const id of s.alive) s.dice[id] = s.dice[id].map(() => 1 + g.int(6)).sort()
  s.bid = null
  s.bids = []
  s.phase = 'bid'
  s.call = null
  s.round++
  s.until = g.now + g.config.turnSeconds * 1000
  g.wake(s.until)
}

export function higher(g: Ctx<C>, bid: Bid | null, q: number, f: number) {
  if (!(Number.isInteger(q) && Number.isInteger(f) && q >= 1 && f >= minFace(g) && f <= 6)) return false
  return !bid || q > bid.q || (q === bid.q && f > bid.f)
}

function call(g: Ctx<C>, s: S, by: string, auto: boolean) {
  const bid = s.bid!
  let actual = 0
  for (const id of s.alive) for (const d of s.dice[id]) if (d === bid.f || (wild(g) && d === 1)) actual++
  const loser = actual >= bid.q ? by : bid.by
  s.call = { by, bid, actual, loser, auto }
  s.phase = 'show'
  s.until = g.now + SHOW_MS
  g.wake(s.until)
}

function standings(s: S): Standing[] {
  const order = [...s.alive, ...s.out.slice().reverse()]
  return order.map((id, i) => ({ id, place: i + 1, score: s.alive.includes(id) ? 'Winner' : 'Out' }))
}

function afterShow(g: Ctx<C>, s: S) {
  const loser = s.call!.loser
  s.dice[loser].pop()
  let next = s.alive.indexOf(loser)
  if (!s.dice[loser].length) {
    s.alive.splice(next, 1)
    s.out.push(loser)
    if (next >= s.alive.length) next = 0
  }
  if (s.alive.length <= 1) return g.end(standings(s), { dice: g.config.dice })
  s.turn = next
  roll(g, s)
}

export const liarsdice: Game<S, C> = {
  setup(g) {
    const s: S = { alive: g.players.slice(), dice: {}, turn: g.int(g.players.length), bid: null, bids: [], phase: 'bid', until: 0, call: null, out: [], round: 0 }
    for (const id of s.alive) s.dice[id] = Array(g.config.dice).fill(1)
    roll(g, s)
    return s
  },
  leave(g, s, id) {
    const i = s.alive.indexOf(id)
    if (i < 0) return
    s.alive.splice(i, 1)
    s.out.push(id)
    if (s.alive.length <= 1) return g.end(standings(s))
    if (s.turn >= s.alive.length) s.turn = 0
    if (s.phase === 'bid') roll(g, s)
  },
  act(g, s, id, m) {
    if (s.phase !== 'bid') return
    if (s.alive[s.turn] !== id) return 'Not your turn'
    if (m.a === 'bid') {
      const q = Math.round(Number(m.q)), f = Math.round(Number(m.f))
      if (q > total(s)) return `There are only ${total(s)} dice on the table`
      if (!higher(g, s.bid, q, f)) return wild(g) && f === 1 ? 'Ones are wild: bid on 2 to 6' : 'Bid more dice, or the same number of a higher face'
      s.bid = { q, f, by: id }
      s.bids.push(s.bid)
      s.turn = (s.turn + 1) % s.alive.length
      s.until = g.now + g.config.turnSeconds * 1000
      g.wake(s.until)
      return
    }
    if (m.a === 'liar') {
      if (!s.bid) return 'Make the first bid'
      return call(g, s, id, false)
    }
  },
  tick(g, s) {
    if (s.phase === 'show') return afterShow(g, s)
    const id = s.alive[s.turn]
    // Out of time: call the last bid, or open with the smallest bid.
    if (s.bid) return call(g, s, id, true)
    s.bid = { q: 1, f: minFace(g), by: id }
    s.bids.push(s.bid)
    s.turn = (s.turn + 1) % s.alive.length
    s.until = g.now + g.config.turnSeconds * 1000
    g.wake(s.until)
  },
  view(g, s, id) {
    const show = s.phase === 'show'
    return {
      alive: s.alive, out: s.out, turn: s.alive[s.turn], bid: s.bid, bids: s.bids.slice(-8), phase: s.phase, until: s.until, round: s.round,
      counts: Object.fromEntries(Object.keys(s.dice).map(p => [p, s.alive.includes(p) ? s.dice[p].length : 0])),
      mine: s.dice[id] && s.alive.includes(id) ? s.dice[id] : null,
      all: show ? Object.fromEntries(s.alive.map(p => [p, s.dice[p]])) : null,
      call: s.call, total: total(s), wild: wild(g),
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'bid' || s.alive[s.turn] !== id) return null
    if (s.bid && (g.rand() < 0.35 || s.bid.q >= total(s))) return { a: 'liar' }
    const f = minFace(g) + g.int(7 - minFace(g))
    const q = s.bid ? (f > s.bid.f ? s.bid.q : s.bid.q + 1) : 1
    return { a: 'bid', q, f }
  },
}
