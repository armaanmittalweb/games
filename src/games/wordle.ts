// Word Race: multiplayer Wordle. The server picks the words and scores every guess; a player only receives a word
// once they are done with it.
import type { Game } from '../engine'
import { rank } from '../engine'
import { ANSWERS, VALID, score } from '../words'

type Mode = 'marathon' | 'race' | 'survival' | 'blitz'
interface C { mode: Mode; words: number; minutes: number; roundSeconds: number }

interface Result { solved: boolean; tries: number; at: number; pts: number; place?: number }
interface P {
  idx: number
  guesses: string[]
  marks: number[][]
  results: (Result | null)[]
  points: number
  solved: number
  tries: number
  lastSolveAt: number
  firsts: number
  solveMs: number
  out: boolean
  finishedAt: number | null
}
interface S {
  words: string[]
  phase: 'playing' | 'reveal'
  startedAt: number
  endsAt: number
  round: number
  roundStartedAt: number
  roundEndsAt: number
  revealUntil: number
  p: Record<string, P>
}

const COUNTDOWN_MS = 3000
const REVEAL_MS = 5000
const BONUS = [3, 2, 1]

const fresh = (idx = 0): P => ({ idx, guesses: [], marks: [], results: [], points: 0, solved: 0, tries: 0, lastSolveAt: 0, firsts: 0, solveMs: 0, out: false, finishedAt: null })

function key(p: P, mode: Mode): number[] {
  switch (mode) {
    case 'marathon': return [-p.points, -p.solved, p.tries, p.lastSolveAt]
    case 'race': return [-p.solved, p.lastSolveAt, p.tries]
    case 'survival': return [-p.solved, p.tries, p.lastSolveAt]
    case 'blitz': return [-p.points, -p.firsts, p.solveMs, p.tries]
  }
}

const blitz = (c: C) => c.mode === 'blitz'

function close(c: C, s: S, p: P, solved: boolean, at: number, now: number) {
  const tries = p.guesses.length
  const r: Result = { solved, tries, at, pts: 0 }
  if (solved) {
    r.pts = 7 - tries
    if (blitz(c)) {
      const place = Object.values(s.p).filter(q => q.results[s.round]?.solved).length + 1
      r.place = place
      r.pts += BONUS[place - 1] ?? 0
      if (place === 1) p.firsts++
      p.solveMs += at
    } else {
      p.lastSolveAt = at
    }
    p.points += r.pts
    p.solved++
    p.tries += tries
  } else if (c.mode === 'survival') {
    p.out = true
  }
  if (blitz(c)) {
    p.results[s.round] = r
  } else {
    p.results[p.idx] = r
    p.idx++
    p.guesses = []
    p.marks = []
    if (p.out || p.idx >= s.words.length) p.finishedAt = now
  }
}

function standings(g: Parameters<Game['view']>[0], s: S) {
  const c = g.config as unknown as C
  return rank(g.players.map(id => ({ id, p: s.p[id] })), t => key(t.p, c.mode),
    t => (c.mode === 'marathon' || c.mode === 'blitz') ? t.p.points : t.p.solved,
    t => (c.mode === 'marathon' || c.mode === 'blitz') ? `${t.p.solved} solved` : t.p.out ? 'out' : `${t.p.tries} guesses`)
}

function finish(g: Parameters<Game['view']>[0], s: S) {
  const c = g.config as unknown as C
  const now = g.now
  for (const id of g.players) {
    const p = s.p[id]
    if (blitz(c)) { if (!p.results[s.round] && s.phase === 'playing') p.results[s.round] = { solved: false, tries: p.guesses.length, at: now - s.roundStartedAt, pts: 0 } }
    else if (p.finishedAt === null && p.guesses.length && p.idx < s.words.length) p.results[p.idx] = { solved: false, tries: p.guesses.length, at: now - s.startedAt, pts: 0 }
  }
  const guesses = g.players.reduce((a, id) => a + s.p[id].results.reduce((b, r) => b + (r?.tries ?? 0), 0), 0)
  const solved = g.players.reduce((a, id) => a + s.p[id].solved, 0)
  g.end(standings(g, s), {
    words: s.words,
    results: Object.fromEntries(g.players.map(id => [id, s.p[id].results])),
    stats: { guesses, solved },
  })
}

function endRound(g: Parameters<Game['view']>[0], s: S) {
  for (const id of g.players) {
    const p = s.p[id]
    if (!p.results[s.round]) p.results[s.round] = { solved: false, tries: p.guesses.length, at: s.roundEndsAt - s.roundStartedAt, pts: 0 }
  }
  s.phase = 'reveal'
  s.revealUntil = g.now + REVEAL_MS
  g.wake(s.revealUntil)
}

function settle(g: Parameters<Game['view']>[0], s: S) {
  const c = g.config as unknown as C
  if (s.phase !== 'playing') return
  const ps = g.players.map(id => [id, s.p[id]] as const)
  if (blitz(c)) {
    const waiting = ps.filter(([id, q]) => !q.results[s.round] && (g.online.has(id) || q.guesses.length))
    if (!waiting.length) endRound(g, s)
  } else if (ps.every(([, q]) => q.finishedAt !== null)) {
    finish(g, s)
  }
}

export const wordle: Game<S, C> = {
  setup(g) {
    const c = g.config
    const pool = g.shuffle(ANSWERS.slice())
    const start = g.now + COUNTDOWN_MS
    const s: S = {
      words: pool.slice(0, c.words), phase: 'playing', startedAt: start,
      endsAt: blitz(c) ? 0 : start + c.minutes * 60_000,
      round: 0, roundStartedAt: start, roundEndsAt: blitz(c) ? start + c.roundSeconds * 1000 : 0, revealUntil: 0,
      p: Object.fromEntries(g.players.map(id => [id, fresh()])),
    }
    g.wake(blitz(c) ? s.roundEndsAt : s.endsAt)
    return s
  },

  join(g, s, id) {
    s.p[id] = fresh(blitz(g.config) ? s.round : 0)
    return true
  },

  act(g, s, id, m) {
    const c = g.config
    const p = s.p[id]
    const now = g.now
    if (s.phase !== 'playing') return 'The next word is coming'
    if (now < s.startedAt) return 'Wait for the countdown'
    if (p.out || p.finishedAt !== null) return 'You are done. Wait for the others'
    if (blitz(c) && p.results[s.round]) return 'You are done with this word'
    const answer = s.words[p.idx]
    const since = blitz(c) ? s.roundStartedAt : s.startedAt
    if (m.a === 'skip') {
      if (blitz(c)) return 'No skipping in Blitz'
      close(c, s, p, false, now - since, now)
    } else if (m.a === 'guess') {
      const w = String(m.word ?? '').toLowerCase()
      if (!/^[a-z]{5}$/.test(w)) return 'Five letters'
      if (!VALID.has(w)) return 'Not a real English word'
      p.guesses.push(w)
      p.marks.push(score(w, answer))
      if (w === answer) close(c, s, p, true, now - since, now)
      else if (p.guesses.length >= 6) close(c, s, p, false, now - since, now)
    } else return
    settle(g, s)
  },

  leave(g, s) { settle(g, s) },

  tick(g, s) {
    const c = g.config
    const now = g.now
    if (s.phase === 'playing') {
      if (blitz(c) && now >= s.roundEndsAt) endRound(g, s)
      else if (!blitz(c) && now >= s.endsAt) return finish(g, s)
      else g.wake(blitz(c) ? s.roundEndsAt : s.endsAt)
    }
    if (s.phase === 'reveal' && now >= s.revealUntil) {
      if (s.round + 1 >= s.words.length) return finish(g, s)
      s.round++
      s.phase = 'playing'
      s.roundStartedAt = now
      s.roundEndsAt = now + c.roundSeconds * 1000
      for (const id of g.players) { const q = s.p[id]; q.idx = s.round; q.guesses = []; q.marks = [] }
      g.wake(s.roundEndsAt)
    }
  },

  view(g, s, id) {
    const c = g.config
    const st = standings(g, s)
    const place = Object.fromEntries(st.map(x => [x.id, x.place]))
    const players = st.map(x => {
      const p = s.p[x.id]
      return {
        id: x.id, place: place[x.id], idx: p.idx, solved: p.solved, points: p.points, out: p.out, finished: p.finishedAt !== null,
        // Friends see the colours of your latest guess, never the letters.
        marks: p.marks.length ? p.marks[p.marks.length - 1] : null, tries: p.marks.length,
        results: p.results.map(r => r && { solved: r.solved, tries: r.tries, at: blitz(c) ? r.at : undefined, pts: r.pts, place: r.place }),
      }
    })
    const p = s.p[id]
    return {
      mode: c.mode, total: s.words.length, phase: s.phase, startedAt: s.startedAt, endsAt: s.endsAt, round: s.round,
      roundEndsAt: s.roundEndsAt, revealUntil: s.revealUntil, players,
      reveal: s.phase === 'reveal' ? s.words[s.round] : undefined,
      me: p && {
        idx: p.idx, guesses: p.guesses, marks: p.marks,
        // Only words this player is finished with.
        words: s.words.map((w, i) => (blitz(c) ? (i < s.round || p.results[i] || (i === s.round && s.phase === 'reveal')) : i < p.idx) ? w : null),
      },
    }
  },

  bot(g, s, id) {
    const p = s.p[id]
    if (s.phase !== 'playing' || g.now < s.startedAt || p.out || p.finishedAt !== null || (blitz(g.config) && p.results[s.round])) return null
    return { a: 'guess', word: g.rand() < 0.3 ? s.words[p.idx] : g.pick(ANSWERS) }
  },
}
