// Auction: everyone starts with 100 coins. Lots come up one at a time and anyone can raise the bid; when the clock
// runs out the top bid wins. Lots are worth points, three from one set earn a bonus, mystery lots hide their worth
// until sold, and every 10 coins left over is worth a point. Most points wins.
import { rank, type Ctx, type Game } from '../engine'
import { LOTS_BY_SET, SETS, type Lot } from '../content/auction'

interface C { lots: number; seconds: number }
interface Sold { lot: Lot; to: string | null; price: number }
interface S {
  lots: Lot[]
  idx: number
  phase: 'bid' | 'sold'
  bid: number
  top: string | null
  /** Bids on this lot, newest last, for the page to show. */
  log: { id: string; bid: number }[]
  until: number
  coins: Record<string, number>
  won: Record<string, Lot[]>
  sold: Sold[]
}

export const START_COINS = 100
const SOLD_MS = 4000
const RAISES = [1, 5, 10]
/** A bid always leaves at least this long on the clock, so others can answer it. */
const ANSWER_MS = 4000

/** Points for what a player won: each lot's worth, plus 10 for every three lots from the same set. */
export function tally(lots: Lot[], coins: number) {
  const items = lots.reduce((a, l) => a + l.pts, 0)
  const bySet: Record<string, number> = {}
  for (const l of lots) bySet[l.set] = (bySet[l.set] ?? 0) + 1
  const sets = Object.values(bySet).reduce((a, n) => a + Math.floor(n / 3), 0)
  const cash = Math.floor(coins / 10)
  return { items, sets, bonus: sets * 10, cash, total: items + sets * 10 + cash }
}

function openLot(g: Ctx<C>, s: S) {
  s.phase = 'bid'
  s.bid = 0
  s.top = null
  s.log = []
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function hammer(g: Ctx<C>, s: S) {
  const lot = s.lots[s.idx]
  if (s.top) {
    s.coins[s.top] -= s.bid
    ;(s.won[s.top] ??= []).push(lot)
  }
  s.sold.push({ lot, to: s.top, price: s.bid })
  s.phase = 'sold'
  s.until = g.now + SOLD_MS
  g.wake(s.until)
}

export const auction: Game<S, C> = {
  setup(g) {
    // Three sets are in play, so collecting one is possible; the lots of all three come up in a mixed order.
    const per = Math.max(3, Math.round(g.config.lots / 3))
    const lots = g.shuffle(g.deal('auction:sets', SETS, 3).flatMap(set => g.deal(`auction:${set}`, LOTS_BY_SET[set], per)))
    const coins: Record<string, number> = {}
    for (const id of g.players) coins[id] = START_COINS
    const s: S = { lots, idx: 0, phase: 'bid', bid: 0, top: null, log: [], until: 0, coins, won: {}, sold: [] }
    openLot(g, s)
    return s
  },
  join(g, s, id) { s.coins[id] = START_COINS; return true },
  act(g, s, id, m) {
    if (m.a !== 'bid' || s.phase !== 'bid') return
    const raise = Number(m.by)
    const to = m.to !== undefined ? Math.floor(Number(m.to)) : s.bid + (RAISES.includes(raise) ? raise : 1)
    if (!(to > s.bid)) return `Bid more than ${s.bid}`
    if (to > s.coins[id]) return `You have ${s.coins[id]} coins`
    if (s.top === id) return 'You are already the top bid'
    s.bid = to
    s.top = id
    s.log.push({ id, bid: to })
    if (s.log.length > 12) s.log.shift()
    s.until = Math.max(s.until, g.now + ANSWER_MS)
    g.wake(s.until)
  },
  tick(g, s) {
    if (s.phase === 'bid') return hammer(g, s)
    if (s.idx + 1 >= s.lots.length) {
      const t = (id: string) => tally(s.won[id] ?? [], s.coins[id] ?? 0)
      return g.end(rank(g.players.map(id => ({ id })), x => [-t(x.id).total, -(s.coins[x.id] ?? 0)], x => t(x.id).total,
        x => { const r = t(x.id); return `${r.items} from lots${r.sets ? ` + ${r.bonus} sets` : ''} + ${r.cash} coins` }),
      { sold: s.sold.map(x => ({ name: x.lot.name, set: x.lot.set, pts: x.lot.pts, to: x.to, price: x.price })) })
    }
    s.idx++
    openLot(g, s)
  },
  view(g, s, id) {
    const lot = s.lots[s.idx]
    const shown = (l: Lot, sold: boolean) => ({ name: l.name, set: l.set, pts: l.mystery && !sold ? null : l.pts, mystery: !!l.mystery })
    return {
      idx: s.idx, total: s.lots.length, phase: s.phase, until: s.until, bid: s.bid, top: s.top, log: s.log,
      lot: shown(lot, s.phase === 'sold'), next: s.lots.slice(s.idx + 1, s.idx + 4).map(l => shown(l, false)),
      coins: s.coins, raises: RAISES, sets: SETS,
      won: Object.fromEntries(g.players.map(p => [p, (s.won[p] ?? []).map(l => ({ name: l.name, set: l.set, pts: l.pts }))])),
      scores: Object.fromEntries(g.players.map(p => [p, tally(s.won[p] ?? [], s.coins[p] ?? 0).total])),
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'bid' || s.top === id || g.rand() < 0.6) return null
    const lot = s.lots[s.idx]
    const worth = (lot.mystery ? 8 : lot.pts) * 1.6
    return s.bid + 1 <= Math.min(worth, s.coins[id]) ? { a: 'bid', by: g.pick([1, 1, 5]) } : null
  },
}
