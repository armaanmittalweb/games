// Trivia: same question for everyone; right and fast scores most, with a bonus for a streak.
import { byPoints, type Ctx, type Game } from '../engine'
import { TRIVIA, type Question } from '../content/trivia'
import { allIn } from './util'

interface C { rounds: number; seconds: number; category: string; difficulty: string }
interface S {
  qs: { q: string; choices: string[]; right: number; cat: string }[]
  round: number
  phase: 'answer' | 'reveal'
  opened: number
  until: number
  answers: Record<string, { i: number; at: number }>
  gained: Record<string, number>
  pts: Record<string, number>
  streak: Record<string, number>
  right: Record<string, number>
}

const LEAD_MS = 2500 // the question shows alone before the choices
const REVEAL_MS = 4500

export function pickQuestions(g: Ctx<C>, n: number): S['qs'] {
  const c = g.config
  // "Everything" leaves out video games (a category of its own) and "Mixed" leaves out the hard questions.
  const cat = (q: Question) => (c.category === 'any' ? q.c !== 'games' : q.c === c.category)
  let pool = TRIVIA.filter(q => cat(q) && (c.difficulty === 'any' ? q.d !== 'hard' : q.d === c.difficulty))
  if (pool.length < n) pool = TRIVIA.filter(cat)
  return g.shuffle(pool.slice()).slice(0, n).map((q: Question) => {
    // True or false stays in that order; four choices are shuffled.
    const choices = q.w.length === 1 ? ['True', 'False'] : g.shuffle([q.a, ...q.w])
    return { q: q.q, choices, right: choices.indexOf(q.a), cat: q.c }
  })
}

function open(g: Ctx<C>, s: S) {
  s.phase = 'answer'
  s.answers = {}
  s.gained = {}
  s.opened = g.now + LEAD_MS
  s.until = s.opened + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const q = s.qs[s.round]
  const total = g.config.seconds * 1000
  for (const id of g.players) {
    const a = s.answers[id]
    if (a && a.i === q.right) {
      s.streak[id] = (s.streak[id] ?? 0) + 1
      s.right[id] = (s.right[id] ?? 0) + 1
      const speed = Math.round(500 * Math.max(0, 1 - (a.at - s.opened) / total))
      const bonus = s.streak[id] >= 3 ? Math.min(300, (s.streak[id] - 2) * 100) : 0
      s.gained[id] = 500 + speed + bonus
      s.pts[id] = (s.pts[id] ?? 0) + s.gained[id]
    } else {
      s.streak[id] = 0
      s.gained[id] = 0
    }
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const trivia: Game<S, C> = {
  setup(g) {
    const s: S = { qs: pickQuestions(g, g.config.rounds), round: 0, phase: 'answer', opened: 0, until: 0, answers: {}, gained: {}, pts: {}, streak: {}, right: {} }
    open(g, s)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    if (m.a !== 'answer' || s.phase !== 'answer' || s.answers[id]) return
    if (g.now < s.opened) return 'Wait for the choices'
    const i = Number(m.i)
    if (!(i >= 0 && i < s.qs[s.round].choices.length)) return
    s.answers[id] = { i, at: g.now }
    if (allIn(g, s.answers)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'answer') return reveal(g, s)
    if (s.round + 1 >= s.qs.length) return g.end(byPoints(s.pts, g.players, id => `${s.right[id] ?? 0}/${s.qs.length} right`))
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const q = s.qs[s.round]
    const picks: Record<string, number> = {}
    if (s.phase === 'reveal') for (const [pid, a] of Object.entries(s.answers)) picks[pid] = a.i
    return {
      round: s.round, rounds: s.qs.length, q: q.q, cat: q.cat, choices: q.choices, phase: s.phase, opened: s.opened, until: s.until,
      mine: s.answers[id]?.i ?? null, answered: Object.keys(s.answers), pts: s.pts, streak: s.streak[id] ?? 0,
      right: s.phase === 'reveal' ? q.right : null, picks, gained: s.phase === 'reveal' ? s.gained : {},
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'answer' || s.answers[id] || g.now < s.opened) return null
    return { a: 'answer', i: g.int(s.qs[s.round].choices.length) }
  },
}
