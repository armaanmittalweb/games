// Mind Meld: everyone answers the same prompt; you score a point for every other player who said the same thing.
import { byPoints, clean, norm, type Ctx, type Game } from '../engine'
import { MIND_MELD } from '../content/party'
import { allIn, singular } from './util'

interface C { rounds: number; seconds: number }
interface Group { text: string; ids: string[] }
interface S {
  prompts: string[]
  round: number
  phase: 'answer' | 'reveal'
  until: number
  answers: Record<string, string>
  groups: Group[]
  pts: Record<string, number>
  matches: Record<string, number>
}

const REVEAL_MS = 7000
const keyOf = (t: string) => singular(norm(t))

function open(g: Ctx<C>, s: S) {
  s.phase = 'answer'
  s.answers = {}
  s.groups = []
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const by = new Map<string, Group>()
  for (const id of g.players) {
    const a = s.answers[id]
    if (!a) continue
    const k = keyOf(a)
    if (!k) continue
    const grp = by.get(k) ?? { text: a, ids: [] }
    grp.ids.push(id)
    by.set(k, grp)
  }
  s.groups = [...by.values()].sort((a, b) => b.ids.length - a.ids.length)
  for (const grp of s.groups) {
    for (const id of grp.ids) {
      s.pts[id] = (s.pts[id] ?? 0) + grp.ids.length - 1
      if (grp.ids.length > 1) s.matches[id] = (s.matches[id] ?? 0) + 1
    }
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const mindmeld: Game<S, C> = {
  setup(g) {
    const s: S = { prompts: g.shuffle(MIND_MELD.slice()).slice(0, g.config.rounds), round: 0, phase: 'answer', until: 0, answers: {}, groups: [], pts: {}, matches: {} }
    open(g, s)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    if (m.a !== 'answer' || s.phase !== 'answer') return
    const text = clean(m.text, 40)
    if (!keyOf(text)) return 'Type an answer'
    s.answers[id] = text
    if (allIn(g, s.answers)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'answer') return reveal(g, s)
    if (s.round + 1 >= s.prompts.length) return g.end(byPoints(s.pts, g.players, id => `${s.matches[id] ?? 0} match${s.matches[id] === 1 ? '' : 'es'}`))
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    return {
      round: s.round, rounds: s.prompts.length, prompt: s.prompts[s.round], phase: s.phase, until: s.until,
      mine: s.answers[id] ?? null, answered: Object.keys(s.answers), groups: s.phase === 'reveal' ? s.groups : [], pts: s.pts,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'answer' || s.answers[id]) return null
    return { a: 'answer', text: g.pick(['apple', 'Apples', 'banana', 'mango', 'cat']) }
  },
}
