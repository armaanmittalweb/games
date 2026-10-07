// Dictionary Bluff: write a believable definition for a rare word, then find the real one among everyone's.
import { byPoints, clean, norm, type Ctx, type Game } from '../engine'
import { BLUFF_WORDS, type BluffWord } from '../content/bluff'
import { active, allIn } from './util'

interface C { rounds: number; writeSeconds: number; voteSeconds: number }
interface Option { text: string; by: string | null } // by null: the real definition
interface S {
  words: BluffWord[]
  round: number
  phase: 'write' | 'vote' | 'reveal'
  until: number
  fakes: Record<string, string>
  options: Option[]
  votes: Record<string, number>
  gained: Record<string, number>
  pts: Record<string, number>
  fooled: Record<string, number>
}

const REVEAL_MS = 9000

function write(g: Ctx<C>, s: S) {
  s.phase = 'write'
  s.fakes = {}
  s.options = []
  s.votes = {}
  s.gained = {}
  s.until = g.now + g.config.writeSeconds * 1000
  g.wake(s.until)
}

function vote(g: Ctx<C>, s: S) {
  const w = s.words[s.round]
  s.options = g.shuffle([{ text: w.d, by: null }, ...Object.entries(s.fakes).map(([by, text]) => ({ text, by }))])
  s.phase = 'vote'
  s.until = g.now + g.config.voteSeconds * 1000
  g.wake(s.until)
  // Nobody wrote anything, or only one person did (they cannot vote for their own): straight to the answer.
  if (active(g).every(id => !canVote(s, id))) reveal(g, s)
}

/** A player can vote if there is an option that is not theirs. */
const canVote = (s: S, id: string) => s.options.some(o => o.by !== id)

function reveal(g: Ctx<C>, s: S) {
  for (const [voter, i] of Object.entries(s.votes)) {
    const o = s.options[i]
    if (!o) continue
    if (o.by === null) s.gained[voter] = (s.gained[voter] ?? 0) + 3
    else if (o.by !== voter) { s.gained[o.by] = (s.gained[o.by] ?? 0) + 2; s.fooled[o.by] = (s.fooled[o.by] ?? 0) + 1 }
  }
  for (const [id, n] of Object.entries(s.gained)) s.pts[id] = (s.pts[id] ?? 0) + n
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const bluff: Game<S, C> = {
  setup(g) {
    const s: S = { words: g.deal('bluff', BLUFF_WORDS, g.config.rounds), round: 0, phase: 'write', until: 0, fakes: {}, options: [], votes: {}, gained: {}, pts: {}, fooled: {} }
    write(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a === 'write' && s.phase === 'write') {
      const text = clean(m.text, 140)
      if (text.length < 3) return 'Write a definition'
      if (norm(text) === norm(s.words[s.round].d)) return 'That is the real one! Write a fake'
      if (Object.entries(s.fakes).some(([by, t]) => by !== id && norm(t) === norm(text))) return 'Someone already wrote that. Try another'
      s.fakes[id] = text
      if (allIn(g, s.fakes)) vote(g, s)
    } else if (m.a === 'vote' && s.phase === 'vote') {
      const i = Number(m.i)
      const o = s.options[i]
      if (!o) return
      if (o.by === id) return 'That one is yours'
      s.votes[id] = i
      const voters = active(g).filter(p => canVote(s, p))
      if (voters.every(p => s.votes[p] !== undefined)) reveal(g, s)
    }
  },
  tick(g, s) {
    if (s.phase === 'write') return vote(g, s)
    if (s.phase === 'vote') return reveal(g, s)
    if (s.round + 1 >= s.words.length) return g.end(byPoints(s.pts, g.players, id => `fooled ${s.fooled[id] ?? 0}`))
    s.round++
    write(g, s)
  },
  view(g, s, id) {
    const w = s.words[s.round]
    const shown = s.phase === 'reveal'
    return {
      round: s.round, rounds: s.words.length, word: w.w, phase: s.phase, until: s.until,
      mine: s.fakes[id] ?? null, wrote: Object.keys(s.fakes), voted: Object.keys(s.votes), myVote: s.votes[id] ?? null,
      options: s.options.map((o, i) => ({
        text: o.text, mine: o.by === id,
        real: shown ? o.by === null : undefined, by: shown ? o.by : undefined,
        voters: shown ? Object.keys(s.votes).filter(v => s.votes[v] === i) : undefined,
      })),
      real: shown ? w.d : null, gained: shown ? s.gained : {}, pts: s.pts,
    }
  },
  bot(g, s, id) {
    if (s.phase === 'write' && !s.fakes[id]) return { a: 'write', text: `a kind of ${g.pick(['bird', 'hat', 'dance', 'cheese'])} ${g.int(1000)}` }
    if (s.phase === 'vote' && s.votes[id] === undefined) {
      const ok = s.options.map((o, i) => ({ o, i })).filter(x => x.o.by !== id)
      return ok.length ? { a: 'vote', i: g.pick(ok).i } : null
    }
    return null
  },
}
