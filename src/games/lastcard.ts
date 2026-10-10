// Last Card: an Uno-style shedding game. Cards are two-character codes: colour (r y g b, x for wild) and value
// (0-9, s skip, r reverse, d draw two, w wild, f wild draw four).
import { rank, type Ctx, type Game } from '../engine'

interface C { hand: number; stack: 'on' | 'off'; turnSeconds: number }
interface S {
  /** Players whose phones went: their turns are short (they draw) until they are back. */
  gone?: string[]
  order: string[]
  hands: Record<string, string[]>
  pile: string[] // draw pile, top at the end
  discard: string[] // top at the end
  color: string
  turn: number
  dir: 1 | -1
  owed: number // cards the player on turn must draw (stacked +2 / +4)
  drawn: string | null // the card just drawn, which may be played
  called: Record<string, boolean>
  exposed: string | null // has one card and did not call: anyone can catch them
  until: number
  log: string[]
  winner: string | null
  fx: Fx[] // the last few moves, numbered, so every screen can animate them in order
  fxn: number
}
/** play: `c` as it lies on the pile (a wild carries its colour); skip/hit/owed name who it hurts. */
type Fx = { n: number; k: 'play'; by: string; c: string; skip?: string; rev?: boolean; hit?: string; drew?: number; owed?: number; last?: boolean }
  | { n: number; k: 'draw'; by: string; drew: number }
  | { n: number; k: 'call'; by: string }
  | { n: number; k: 'catch'; by: string; who: string }
  | { n: number; k: 'shuffle' }

type FxIn = Fx extends infer F ? F extends Fx ? Omit<F, 'n'> : never : never
function fx(s: S, e: FxIn) {
  s.fx.push({ ...e, n: ++s.fxn } as Fx)
  if (s.fx.length > 8) s.fx.shift()
}

const COLORS = ['r', 'y', 'g', 'b']
const value = (c: string) => c[1]
const isWild = (c: string) => c[0] === 'x'
const cardPoints = (c: string) => isWild(c) ? 50 : /\d/.test(value(c)) ? Number(value(c)) : 20

function deck(copies: number) {
  const d: string[] = []
  for (let k = 0; k < copies; k++) {
    for (const col of COLORS) {
      d.push(col + '0')
      for (const v of '123456789srd') d.push(col + v, col + v)
    }
    for (let i = 0; i < 4; i++) d.push('xw', 'xf')
  }
  return d
}

const top = (s: S) => s.discard[s.discard.length - 1]
const cur = (s: S) => s.order[s.turn]
/** A turn for a player whose phone has gone: long enough to see it pass, then they draw. */
const AWAY_TURN_MS = 2500
const nameOf = (g: Ctx<C>, id: string) => g.names[id] ?? 'Someone'

function draw(g: Ctx<C>, s: S, id: string, n: number) {
  const got: string[] = []
  for (let i = 0; i < n; i++) {
    if (!s.pile.length) {
      const keep = s.discard.pop()!
      s.pile = g.shuffle(s.discard.map(c => ('wf'.includes(value(c)) ? 'x' + value(c) : c)))
      s.discard = [keep]
      fx(s, { k: 'shuffle' })
      if (!s.pile.length) break
    }
    const c = s.pile.pop()!
    s.hands[id].push(c)
    got.push(c)
  }
  if (s.hands[id].length > 1) s.called[id] = false
  if (s.exposed === id && s.hands[id].length !== 1) s.exposed = null
  return got
}

export function playable(s: S, c: string, stack: boolean) {
  const t = top(s)
  if (s.owed > 0) return stack && (value(c) === 'f' || (value(c) === 'd' && value(t) === 'd'))
  return isWild(c) || c[0] === s.color || value(c) === value(t)
}

function step(s: S, n = 1) {
  const len = s.order.length
  s.turn = (((s.turn + s.dir * n) % len) + len) % len
}

function say(s: S, line: string) {
  s.log.push(line)
  if (s.log.length > 6) s.log.shift()
}

function startTurn(g: Ctx<C>, s: S) {
  s.drawn = null
  const id = cur(s)
  if (s.gone?.includes(id) && g.online.has(id)) s.gone = s.gone.filter(x => x !== id)
  s.until = g.now + (s.gone?.includes(id) ? AWAY_TURN_MS : g.config.turnSeconds * 1000)
  g.wake(s.until)
}

function finish(g: Ctx<C>, s: S, winner: string) {
  s.winner = winner
  g.wake(0)
  const left = (id: string) => s.hands[id]?.length ?? 99
  const pts = (id: string) => (s.hands[id] ?? []).reduce((a, c) => a + cardPoints(c), 0)
  g.end(rank(g.players.map(id => ({ id })), t => [t.id === winner ? -1 : 0, left(t.id), pts(t.id)], t => left(t.id),
    t => t.id === winner ? 'out first' : `${left(t.id)} card${left(t.id) === 1 ? '' : 's'} left`), { hands: s.hands })
}

/** The player on turn takes what they owe (or one card) and the turn moves on, unless the drawn card can be played. */
function takeDraw(g: Ctx<C>, s: S, id: string, auto: boolean) {
  if (s.owed > 0) {
    const n = s.owed
    const got = draw(g, s, id, n)
    s.owed = 0
    fx(s, { k: 'draw', by: id, drew: got.length })
    say(s, `${nameOf(g, id)} drew ${n}`)
    step(s)
    return startTurn(g, s)
  }
  const [c] = draw(g, s, id, 1)
  if (c) fx(s, { k: 'draw', by: id, drew: 1 })
  if (c && !auto && playable(s, c, g.config.stack === 'on')) {
    s.drawn = c
    s.until = g.now + Math.min(15, g.config.turnSeconds) * 1000
    g.wake(s.until)
    return
  }
  say(s, `${nameOf(g, id)} drew a card`)
  step(s)
  startTurn(g, s)
}

export const lastcard: Game<S, C> = {
  setup(g) {
    const s: S = {
      order: g.players.slice(), hands: {}, pile: g.shuffle(deck(g.players.length > 6 ? 2 : 1)), discard: [], color: 'r', turn: 0, dir: 1,
      owed: 0, drawn: null, called: {}, exposed: null, until: 0, log: [], winner: null, fx: [], fxn: 0,
    }
    for (const id of s.order) { s.hands[id] = []; draw(g, s, id, g.config.hand) }
    // The first card is never an action or a wild.
    let first = s.pile.pop()!
    while (!/\d/.test(value(first))) { s.pile.unshift(first); first = s.pile.pop()! }
    s.discard.push(first)
    s.color = first[0]
    s.turn = g.int(s.order.length)
    startTurn(g, s)
    return s
  },
  leave(g, s, id) {
    if (s.winner) return // the game is already won; it ends after the pause
    const i = s.order.indexOf(id)
    if (i < 0) return
    const wasTurn = i === s.turn
    s.pile.unshift(...(s.hands[id] ?? []))
    delete s.hands[id]
    s.order.splice(i, 1)
    if (s.order.length < 2) return finish(g, s, s.order[0])
    if (i < s.turn) s.turn--
    if (wasTurn && s.dir === -1) s.turn--
    s.turn = (s.turn + s.order.length) % s.order.length
    if (wasTurn) { s.owed = 0; startTurn(g, s) }
  },
  act(g, s, id, m) {
    if (s.winner) return
    const stack = g.config.stack === 'on'
    if (m.a === 'last') {
      if (s.hands[id].length > 2) return 'You can call it with two cards or fewer'
      if (!s.called[id]) fx(s, { k: 'call', by: id })
      s.called[id] = true
      if (s.exposed === id) s.exposed = null
      return
    }
    if (m.a === 'catch') {
      const who = s.exposed
      if (!who || who === id) return 'Nobody to catch'
      draw(g, s, who, 2)
      s.exposed = null
      fx(s, { k: 'catch', by: id, who })
      say(s, `${nameOf(g, id)} caught ${nameOf(g, who)}: +2`)
      return
    }
    if (cur(s) !== id) return 'Not your turn'
    if (m.a === 'draw') {
      if (s.drawn) return 'Play the card you drew or pass'
      return takeDraw(g, s, id, false)
    }
    if (m.a === 'pass') {
      if (!s.drawn) return 'Draw first'
      say(s, `${nameOf(g, id)} drew a card`)
      step(s)
      return startTurn(g, s)
    }
    if (m.a !== 'play') return
    const hand = s.hands[id]
    const i = Number(m.i)
    const c = hand[i]
    if (!c) return
    if (s.drawn && c !== s.drawn) return 'You can only play the card you just drew'
    if (!playable(s, c, stack)) return s.owed ? `Draw ${s.owed} or stack a matching card` : 'That card does not match'
    let color = c[0]
    if (isWild(c)) {
      color = String(m.color)
      if (!COLORS.includes(color)) return 'Pick a colour'
    }
    hand.splice(i, 1)
    s.discard.push(isWild(c) ? color + value(c) : c)
    s.color = color
    s.drawn = null
    if (hand.length === 0) {
      fx(s, { k: 'play', by: id, c: top(s), last: true })
      say(s, `${nameOf(g, id)} played their last card`)
      // Hold the table a moment so everyone sees the winning card land.
      s.winner = id
      s.exposed = null
      s.until = g.now + 2600
      g.wake(s.until)
      return
    }
    if (hand.length === 1 && !s.called[id]) s.exposed = id
    else if (s.exposed && s.exposed !== id) s.exposed = null
    const v = value(c)
    const e: Extract<FxIn, { k: 'play' }> = { k: 'play', by: id, c: top(s) }
    let line = `${nameOf(g, id)} played {${top(s)}}`
    if (v === 's') { step(s); e.skip = cur(s); step(s); line += ' (skip)' }
    else if (v === 'r') {
      s.dir = s.dir === 1 ? -1 : 1
      e.rev = true
      // With two players a reverse works like a skip.
      if (s.order.length === 2) { step(s); e.skip = cur(s); step(s) } else step(s)
    } else if (v === 'd' || v === 'f') {
      const n = v === 'd' ? 2 : 4
      if (stack) { s.owed += n; step(s); e.hit = cur(s); e.owed = s.owed }
      else { step(s); e.hit = cur(s); e.drew = n; draw(g, s, cur(s), n); say(s, `${nameOf(g, cur(s))} drew ${n}`); step(s) }
    } else step(s)
    fx(s, e)
    say(s, line)
    startTurn(g, s)
  },
  /** Someone's phone went: their turn (now and later, until they are back) passes with a draw. */
  away(g, s, id) {
    if (s.winner || !s.order.includes(id)) return
    if (!(s.gone ??= []).includes(id)) s.gone.push(id)
    if (cur(s) !== id) return
    if (s.drawn) { say(s, `${nameOf(g, id)} drew a card`); step(s); return startTurn(g, s) }
    takeDraw(g, s, id, true)
  },
  tick(g, s) {
    if (g.now < s.until) return
    if (s.winner) return finish(g, s, s.winner)
    const id = cur(s)
    if (s.drawn) { say(s, `${nameOf(g, id)} drew a card`); step(s); return startTurn(g, s) }
    takeDraw(g, s, id, true)
  },
  view(g, s, id) {
    const hand = s.hands[id] ?? []
    const stack = g.config.stack === 'on'
    return {
      order: s.order, counts: Object.fromEntries(s.order.map(p => [p, s.hands[p]?.length ?? 0])), turn: cur(s), dir: s.dir,
      top: top(s), under: s.discard.slice(-4, -1), color: s.color, fx: s.fx, owed: s.owed, pile: s.pile.length, until: s.until, log: s.log, called: s.called, exposed: s.exposed,
      hand, playable: cur(s) === id ? hand.map(c => (s.drawn ? c === s.drawn : playable(s, c, stack))) : hand.map(() => false),
      drawn: cur(s) === id ? s.drawn : null, winner: s.winner,
    }
  },
  bot(g, s, id) {
    if (s.winner) return null
    if (s.exposed && s.exposed !== id && g.rand() < 0.3) return { a: 'catch' }
    if (cur(s) !== id) return null
    const hand = s.hands[id]
    if (hand.length === 2 && !s.called[id] && g.rand() < 0.7) return { a: 'last' }
    const ok = hand.map((c, i) => ({ c, i })).filter(x => (s.drawn ? x.c === s.drawn : playable(s, x.c, g.config.stack === 'on')))
    if (ok.length) { const x = g.pick(ok); return { a: 'play', i: x.i, color: g.pick(COLORS) } }
    return s.drawn ? { a: 'pass' } : { a: 'draw' }
  },
}
