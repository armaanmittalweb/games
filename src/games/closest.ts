// Closest Wins: a question with a number for an answer; the nearest guesses score.
import { byPoints, type Ctx, type Game } from '../engine'
import { ESTIMATES, type Estimate } from '../content/estimates'
import { PLACE, allIn } from './util'

interface C { rounds: number; seconds: number }
interface S {
  qs: Estimate[]
  round: number
  phase: 'answer' | 'reveal'
  until: number
  answers: Record<string, number>
  result: { id: string; guess: number; place: number; pts: number }[]
  pts: Record<string, number>
  bulls: Record<string, number>
}

const REVEAL_MS = 7500

/** How far off a guess is: by ratio for quantities that span sizes, by difference for years and small counts. */
const off = (q: Estimate, v: number) => q.log ? (v > 0 ? Math.abs(Math.log(v / q.a)) : Infinity) : Math.abs(v - q.a)

/** Accepts "8,849", "1.4", "12k", "3 lakh", "2 crore", "828 m" (a trailing unit is ignored). */
export function parseNumber(raw: unknown): number | null {
  let t = String(raw ?? '').toLowerCase().replace(/[,\s₹$]/g, '')
  let mult = 1
  const units: [RegExp, number][] = [[/(crores?|cr)$/, 1e7], [/(lakhs?|lacs?)$/, 1e5], [/(billions?|bn)$/, 1e9], [/(millions?|mn)$/, 1e6], [/(thousands?|k)$/, 1e3]]
  for (const [re, m] of units) if (re.test(t)) { mult = m; t = t.replace(re, ''); break }
  if (mult === 1) t = t.replace(/[a-z%°]+$/, '')
  if (!/^-?\d*\.?\d+$/.test(t)) return null
  const n = Number(t) * mult
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : null
}

function open(g: Ctx<C>, s: S) {
  s.phase = 'answer'
  s.answers = {}
  s.result = []
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const q = s.qs[s.round]
  const rows = Object.entries(s.answers).map(([id, guess]) => ({ id, guess, d: off(q, guess) })).sort((a, b) => a.d - b.d)
  s.result = []
  rows.forEach((r, i) => {
    const place = i > 0 && r.d === rows[i - 1].d ? s.result[i - 1].place : i + 1
    let pts = PLACE[place - 1] ?? 1
    // Within 1% (or spot on for a year or count) is a bullseye.
    const bull = q.log ? r.d < 0.01 : r.d === 0
    if (bull) { pts += 3; s.bulls[r.id] = (s.bulls[r.id] ?? 0) + 1 }
    s.result.push({ id: r.id, guess: r.guess, place, pts })
    s.pts[r.id] = (s.pts[r.id] ?? 0) + pts
  })
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const closest: Game<S, C> = {
  setup(g) {
    const s: S = { qs: g.shuffle(ESTIMATES.slice()).slice(0, g.config.rounds), round: 0, phase: 'answer', until: 0, answers: {}, result: [], pts: {}, bulls: {} }
    open(g, s)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    if (m.a !== 'answer' || s.phase !== 'answer') return
    const n = parseNumber(m.value)
    if (n === null) return 'Type a number'
    s.answers[id] = n
    if (allIn(g, s.answers)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'answer') return reveal(g, s)
    if (s.round + 1 >= s.qs.length) return g.end(byPoints(s.pts, g.players, id => s.bulls[id] ? `${s.bulls[id]} bullseye${s.bulls[id] > 1 ? 's' : ''}` : ''))
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const q = s.qs[s.round]
    return {
      round: s.round, rounds: s.qs.length, q: q.q, unit: q.unit, phase: s.phase, until: s.until,
      mine: s.answers[id] ?? null, answered: Object.keys(s.answers), pts: s.pts,
      answer: s.phase === 'reveal' ? q.a : null, note: s.phase === 'reveal' ? q.note ?? null : null, result: s.phase === 'reveal' ? s.result : [],
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'answer' || s.answers[id] !== undefined) return null
    return { a: 'answer', value: String(Math.round(s.qs[s.round].a * (0.5 + g.rand()))) }
  },
}
