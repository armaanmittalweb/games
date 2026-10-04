// Imposter: everyone shares a secret word except one player. Clues, a discussion, a vote.
import { byPoints, clean, norm, type Ctx, type Game } from '../engine'
import { IMPOSTER_PAIRS, type Pair } from '../content/imposter'
import { active, singular } from './util'

interface C { mode: 'blank' | 'undercover'; rounds: number; clues: number; clueSeconds: number; talkSeconds: number }
interface S {
  round: number
  phase: 'clue' | 'talk' | 'vote' | 'guess' | 'reveal'
  until: number
  pair: Pair
  flip: boolean // undercover: imposter gets a instead of b
  imposter: string
  last: string[] // past imposters, to spread the role around
  order: string[] // this round's players, in clue order
  turn: number
  clues: { id: string; text: string }[]
  ready: Record<string, boolean>
  votes: Record<string, string>
  caught: boolean
  out: string | null // most-voted player
  guess: string | null
  guessed: boolean
  gained: Record<string, number>
  pts: Record<string, number>
  used: number[]
}

const VOTE_MS = 30_000
const GUESS_MS = 25_000
const REVEAL_MS = 9000

const crowd = (s: S) => (s.flip ? s.pair.b : s.pair.a)
const odd = (s: S) => (s.flip ? s.pair.a : s.pair.b)
const wordOf = (g: Ctx<C>, s: S, id: string) => id === s.imposter ? (g.config.mode === 'undercover' ? odd(s) : null) : crowd(s)
const same = (a: string, b: string) => singular(norm(a)).replace(/ /g, '') === singular(norm(b)).replace(/ /g, '')

function start(g: Ctx<C>, s: S) {
  let idx = g.int(IMPOSTER_PAIRS.length)
  for (let i = 0; i < 20 && s.used.includes(idx); i++) idx = g.int(IMPOSTER_PAIRS.length)
  s.used.push(idx)
  s.pair = IMPOSTER_PAIRS[idx]
  s.flip = g.rand() < 0.5
  const shift = s.round % g.players.length
  s.order = [...g.players.slice(shift), ...g.players.slice(0, shift)]
  const fresh = s.order.filter(id => !s.last.includes(id))
  s.imposter = g.pick(fresh.length ? fresh : s.order)
  s.last = [...s.last, s.imposter].slice(-Math.floor(s.order.length / 2))
  Object.assign(s, { phase: 'clue', turn: 0, clues: [], ready: {}, votes: {}, caught: false, out: null, guess: null, guessed: false, gained: {} })
  nextClue(g, s)
}

/** Moves to the next clue-giver who is still here, or on to the talk. */
function nextClue(g: Ctx<C>, s: S) {
  const total = s.order.length * g.config.clues
  while (s.turn < total && !g.online.has(s.order[s.turn % s.order.length])) {
    s.clues.push({ id: s.order[s.turn % s.order.length], text: '(away)' })
    s.turn++
  }
  if (s.turn >= total) {
    s.phase = 'talk'
    s.until = g.now + g.config.talkSeconds * 1000
  } else {
    s.until = g.now + g.config.clueSeconds * 1000
  }
  g.wake(s.until)
}

function tally(g: Ctx<C>, s: S) {
  const count: Record<string, number> = {}
  for (const v of Object.values(s.votes)) count[v] = (count[v] ?? 0) + 1
  const best = Math.max(0, ...Object.values(count))
  const top = Object.keys(count).filter(id => count[id] === best)
  s.out = best > 0 && top.length === 1 ? top[0] : null
  s.caught = s.out === s.imposter
  if (s.caught && g.config.mode === 'blank') {
    s.phase = 'guess'
    s.until = g.now + GUESS_MS
    g.wake(s.until)
    return
  }
  settle(g, s)
}

function settle(g: Ctx<C>, s: S) {
  const add = (id: string, n: number) => { s.gained[id] = (s.gained[id] ?? 0) + n; s.pts[id] = (s.pts[id] ?? 0) + n }
  if (!s.caught) add(s.imposter, 3)
  else if (s.guessed) add(s.imposter, 2)
  else {
    for (const id of s.order) {
      if (id === s.imposter) continue
      add(id, 1)
      if (s.votes[id] === s.imposter) add(id, 1)
    }
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const imposter: Game<S, C> = {
  setup(g) {
    const s = { round: 0, last: [], pts: {}, used: [] } as unknown as S
    start(g, s)
    return s
  },
  join() { return true }, // plays from the next round
  leave(g, s, id) {
    // The imposter was removed: show the words and move on, with no points either way.
    if (id === s.imposter && s.phase !== 'reveal') {
      s.phase = 'reveal'
      s.until = g.now + REVEAL_MS
      g.wake(s.until)
    }
  },
  act(g, s, id, m) {
    const inRound = s.order.includes(id)
    if (!inRound) return 'You join from the next round'
    switch (s.phase) {
      case 'clue': {
        if (m.a !== 'clue') return
        if (s.order[s.turn % s.order.length] !== id) return 'Wait for your turn'
        const text = clean(m.text, 30)
        if (!text) return 'Type a clue'
        const mine = wordOf(g, s, id)
        if (mine && (norm(text).includes(norm(mine)) || same(text, mine))) return 'Your clue cannot be the word itself'
        s.clues.push({ id, text })
        s.turn++
        return nextClue(g, s)
      }
      case 'talk': {
        if (m.a !== 'ready') return
        s.ready[id] = !s.ready[id]
        if (active(g).filter(p => s.order.includes(p)).every(p => s.ready[p])) {
          s.phase = 'vote'
          s.until = g.now + VOTE_MS
          g.wake(s.until)
        }
        return
      }
      case 'vote': {
        if (m.a !== 'vote') return
        const to = String(m.id)
        if (!s.order.includes(to) || to === id) return 'Vote for someone else'
        s.votes[id] = to
        if (active(g).filter(p => s.order.includes(p)).every(p => s.votes[p])) tally(g, s)
        return
      }
      case 'guess': {
        if (m.a !== 'guess' || id !== s.imposter) return
        const text = clean(m.text, 40)
        if (!text) return
        s.guess = text
        s.guessed = same(text, crowd(s))
        return settle(g, s)
      }
    }
  },
  tick(g, s) {
    switch (s.phase) {
      case 'clue':
        s.clues.push({ id: s.order[s.turn % s.order.length], text: '(no clue)' })
        s.turn++
        return nextClue(g, s)
      case 'talk':
        s.phase = 'vote'
        s.until = g.now + VOTE_MS
        g.wake(s.until)
        return
      case 'vote': return tally(g, s)
      case 'guess': return settle(g, s)
      case 'reveal':
        if (s.round + 1 >= g.config.rounds) return g.end(byPoints(s.pts, g.players))
        s.round++
        return start(g, s)
    }
  },
  view(g, s, id) {
    const shown = s.phase === 'reveal'
    const inRound = s.order.includes(id)
    return {
      round: s.round, rounds: g.config.rounds, phase: s.phase, until: s.until, mode: g.config.mode,
      order: s.order, turn: s.order[s.turn % s.order.length], clueNo: Math.floor(s.turn / s.order.length) + 1, clueRounds: g.config.clues,
      inRound, category: s.pair.cat,
      // The imposter in the classic mode sees only the category; in Undercover nobody is told who they are.
      word: inRound ? wordOf(g, s, id) : null,
      isImposter: inRound && g.config.mode === 'blank' && id === s.imposter,
      clues: s.clues, ready: s.ready, voted: Object.keys(s.votes), myVote: s.votes[id] ?? null,
      votes: shown || s.phase === 'guess' ? s.votes : {},
      imposter: shown || s.phase === 'guess' ? s.imposter : null,
      out: shown || s.phase === 'guess' ? s.out : null,
      caught: shown ? s.caught : null, guess: shown ? s.guess : null, guessed: shown ? s.guessed : null,
      words: shown ? { crowd: crowd(s), odd: g.config.mode === 'undercover' ? odd(s) : null } : null,
      gained: shown ? s.gained : {}, pts: s.pts,
    }
  },
  bot(g, s, id) {
    if (!s.order.includes(id)) return null
    if (s.phase === 'clue' && s.order[s.turn % s.order.length] === id) return { a: 'clue', text: 'thing' + g.int(9) }
    if (s.phase === 'talk' && !s.ready[id]) return { a: 'ready' }
    if (s.phase === 'vote' && !s.votes[id]) return { a: 'vote', id: g.pick(s.order.filter(p => p !== id)) }
    if (s.phase === 'guess' && id === s.imposter) return { a: 'guess', text: g.rand() < 0.5 ? crowd(s) : 'nope' }
    return null
  },
}
