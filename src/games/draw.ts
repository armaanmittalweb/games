// Draw & Guess: one player draws a word, the others race to guess it.
import { byPoints, clean, norm, type Ctx, type Game } from '../engine'
import { drawWords } from '../content/draw'
import { active, distance, drawMsg, type Stroke } from './util'

interface C { rounds: number; seconds: number; theme: string }
interface S {
  order: string[] // drawer for each turn
  turn: number
  phase: 'choose' | 'draw' | 'reveal'
  until: number
  started: number
  choices: string[]
  word: string
  shown: number[] // letter positions revealed as hints
  strokes: Stroke[]
  guessed: Record<string, number> // points gained this turn, in guessing order
  turnPts: Record<string, number>
  pts: Record<string, number>
  /** Drawers whose turn was moved to the end because they were away. */
  later?: string[]
}

const CHOOSE_MS = 15_000
const REVEAL_MS = 6000

function next(g: Ctx<C>, s: S) {
  // Skip turns of drawers who have left. A drawer whose line is down draws at the end instead (once), so coming back
  // still gets them their turn.
  while (s.turn < s.order.length) {
    const d = s.order[s.turn]
    if (g.players.includes(d) && g.online.has(d)) break
    if (g.players.includes(d) && !(s.later ??= []).includes(d)) { s.later.push(d); s.order.push(d) }
    s.turn++
  }
  if (s.turn >= s.order.length) return g.end(byPoints(s.pts, g.players))
  s.choices = g.deal(`draw:${g.config.theme}`, drawWords(g.config.theme), 3)
  s.phase = 'choose'
  s.word = ''
  s.shown = []
  s.strokes = []
  s.guessed = {}
  s.turnPts = {}
  s.until = g.now + CHOOSE_MS
  g.wake(s.until)
}

function begin(g: Ctx<C>, s: S, word: string) {
  s.word = word
  s.phase = 'draw'
  s.started = g.now
  s.until = g.now + g.config.seconds * 1000
  g.wake(nextHint(g, s))
}

/** Letters to reveal over the turn: about a third of them, the first at half time. */
function hintTimes(g: Ctx<C>, s: S) {
  const letters = s.word.replace(/[^a-z]/gi, '').length
  const n = letters <= 3 ? 0 : Math.max(1, Math.floor(letters / 3))
  const total = g.config.seconds * 1000
  return Array.from({ length: n }, (_, i) => s.started + total * (0.5 + (0.4 * i) / Math.max(1, n)))
}

function nextHint(g: Ctx<C>, s: S) {
  const t = hintTimes(g, s).find((at, i) => i >= s.shown.length && at > g.now)
  return t ? Math.min(t, s.until) : s.until
}

function finishTurn(g: Ctx<C>, s: S) {
  const drawer = s.order[s.turn]
  const guessers = Object.keys(s.guessed).length
  const eligible = Math.max(1, g.players.filter(id => id !== drawer).length)
  if (guessers) {
    const d = Math.round(20 + (80 * guessers) / eligible)
    s.turnPts[drawer] = d
    s.pts[drawer] = (s.pts[drawer] ?? 0) + d
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const draw: Game<S, C> = {
  setup(g) {
    const order: string[] = []
    for (let r = 0; r < g.config.rounds; r++) order.push(...g.players)
    const s: S = { order, turn: 0, phase: 'choose', until: 0, started: 0, choices: [], word: '', shown: [], strokes: [], guessed: {}, turnPts: {}, pts: {} }
    next(g, s)
    return s
  },
  leave(g, s, id) {
    if (s.order[s.turn] === id && s.phase !== 'reveal') finishTurn(g, s)
  },
  act(g, s, id, m) {
    const drawer = s.order[s.turn]
    if (m.a === 'choose') {
      if (id !== drawer || s.phase !== 'choose') return
      const w = s.choices[Number(m.i)]
      if (w) begin(g, s, w)
      return
    }
    if (m.a === 'line' || m.a === 'undo' || m.a === 'clear') {
      if (id !== drawer || s.phase !== 'draw') return
      const ev = drawMsg(s.strokes, m)
      if (!ev) return
      g.emit(ev, Object.keys(g.names).filter(p => p !== id))
      g.quiet()
      g.lazy()
      return
    }
    if (m.a === 'guess') {
      const text = clean(m.text, 60)
      if (!text) return
      const shout = (msg: Record<string, unknown>, to?: string[]) => { g.emit(msg, to); g.quiet() }
      if (s.phase !== 'draw' || id === drawer || s.guessed[id] !== undefined) {
        // Chat from the drawer and from players who have guessed only reaches others who know the word.
        const insiders = s.phase === 'draw' ? [drawer, ...Object.keys(s.guessed)] : undefined
        return shout({ k: 'msg', id, text, inside: !!insiders }, insiders)
      }
      const guess = norm(text), word = norm(s.word)
      if (guess === word || guess.replace(/ /g, '') === word.replace(/ /g, '')) {
        const order = Object.keys(s.guessed).length
        const left = Math.max(0, s.until - g.now) / (g.config.seconds * 1000)
        const pts = Math.round(40 + 60 * left) + Math.max(0, 15 - order * 5)
        s.guessed[id] = pts
        s.turnPts[id] = pts
        s.pts[id] = (s.pts[id] ?? 0) + pts
        g.emit({ k: 'got', id })
        const left2 = active(g).filter(p => p !== drawer && s.guessed[p] === undefined)
        if (!left2.length) finishTurn(g, s)
        return
      }
      if (word.length >= 4 && distance(guess, word) === 1) g.emit({ k: 'close', text }, id)
      return shout({ k: 'msg', id, text })
    }
  },
  tick(g, s) {
    if (s.phase === 'choose') return begin(g, s, g.pick(s.choices))
    if (s.phase === 'draw') {
      if (g.now >= s.until) return finishTurn(g, s)
      // Reveal the next hint letter.
      const hidden = [...s.word].map((ch, i) => i).filter(i => /[a-z]/i.test(s.word[i]) && !s.shown.includes(i))
      if (hidden.length > 1) s.shown.push(g.pick(hidden))
      g.wake(nextHint(g, s))
      return
    }
    s.turn++
    next(g, s)
  },
  view(g, s, id) {
    const drawer = s.order[s.turn]
    const knows = id === drawer || s.guessed[id] !== undefined || s.phase === 'reveal'
    return {
      drawer, phase: s.phase, until: s.until, turn: s.turn, turns: s.order.length,
      round: Math.min(g.config.rounds, Math.floor(s.turn / Math.max(1, g.players.length)) + 1), rounds: g.config.rounds,
      choices: id === drawer && s.phase === 'choose' ? s.choices : null,
      word: knows ? s.word : null,
      hint: s.phase === 'draw' ? [...s.word].map((ch, i) => /[a-z]/i.test(ch) ? (s.shown.includes(i) || knows ? ch : '_') : ch).join('') : null,
      strokes: s.strokes, guessed: s.guessed, turnPts: s.phase === 'reveal' ? s.turnPts : {}, pts: s.pts,
    }
  },
  bot(g, s, id) {
    const drawer = s.order[s.turn]
    if (s.phase === 'choose' && id === drawer) return { a: 'choose', i: 0 }
    if (s.phase === 'draw' && id === drawer) return { a: 'line', id: g.int(5), c: 1, w: 6, p: [g.int(1000), g.int(750), g.int(1000), g.int(750)] }
    if (s.phase === 'draw' && s.guessed[id] === undefined) return { a: 'guess', text: g.rand() < 0.3 ? s.word : 'banana' }
    return null
  },
}
