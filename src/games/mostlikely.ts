// Most Likely To: everyone votes for a player; voting with the room scores.
import { rank, type Ctx, type Game } from '../engine'
import { MOST_LIKELY } from '../content/party'
import { allIn } from './util'

interface C { rounds: number; seconds: number }
interface S {
  prompts: string[]
  round: number
  phase: 'vote' | 'reveal'
  until: number
  votes: Record<string, string>
  top: string[]
  pts: Record<string, number>
  crowns: Record<string, number>
  titles: { prompt: string; ids: string[] }[]
}

const REVEAL_MS = 6500

function open(g: Ctx<C>, s: S) {
  s.phase = 'vote'
  s.votes = {}
  s.top = []
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const count: Record<string, number> = {}
  for (const v of Object.values(s.votes)) count[v] = (count[v] ?? 0) + 1
  const best = Math.max(0, ...Object.values(count))
  // A title needs at least two votes; a room where everyone picks someone different crowns nobody.
  s.top = best >= 2 ? Object.keys(count).filter(id => count[id] === best) : []
  for (const id of s.top) s.crowns[id] = (s.crowns[id] ?? 0) + 1
  for (const [voter, v] of Object.entries(s.votes)) if (s.top.includes(v)) s.pts[voter] = (s.pts[voter] ?? 0) + 2
  if (s.top.length) s.titles.push({ prompt: s.prompts[s.round], ids: s.top })
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const mostlikely: Game<S, C> = {
  setup(g) {
    const s: S = { prompts: g.deal('mostlikely', MOST_LIKELY, g.config.rounds), round: 0, phase: 'vote', until: 0, votes: {}, top: [], pts: {}, crowns: {}, titles: [] }
    open(g, s)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    if (m.a !== 'vote' || s.phase !== 'vote') return
    const to = String(m.id)
    if (!g.players.includes(to)) return 'Pick a player'
    s.votes[id] = to
    if (allIn(g, s.votes)) reveal(g, s)
  },
  leave(g, s, id) {
    for (const [v, to] of Object.entries(s.votes)) if (to === id) delete s.votes[v]
  },
  tick(g, s) {
    if (s.phase === 'vote') return reveal(g, s)
    if (s.round + 1 >= s.prompts.length) {
      return g.end(rank(g.players.map(id => ({ id })), t => [-(s.pts[t.id] ?? 0), -(s.crowns[t.id] ?? 0)], t => s.pts[t.id] ?? 0,
        t => `${s.crowns[t.id] ?? 0} title${s.crowns[t.id] === 1 ? '' : 's'}`), { titles: s.titles })
    }
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const counts: Record<string, string[]> = {}
    if (s.phase === 'reveal') for (const [voter, v] of Object.entries(s.votes)) (counts[v] ??= []).push(voter)
    return {
      round: s.round, rounds: s.prompts.length, prompt: s.prompts[s.round], phase: s.phase, until: s.until,
      mine: s.votes[id] ?? null, voted: Object.keys(s.votes), counts, top: s.top, pts: s.pts, crowns: s.crowns,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'vote' || s.votes[id]) return null
    return { a: 'vote', id: g.pick(g.players) }
  },
}
