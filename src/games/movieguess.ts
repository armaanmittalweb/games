// Movie Guess: name the film from emojis; a one-line story, then a famous line or a letter hint, come in as the clock
// runs. The sooner you get it, the more it is worth.
import { byPoints, norm, type Ctx, type Game } from '../engine'
import { MOVIES, type Movie } from '../content/movies'
import { allIn, distance } from './util'

interface C { rounds: number; seconds: number; pack: string }
interface S {
  films: Movie[]
  round: number
  phase: 'guess' | 'reveal'
  opened: number
  until: number
  /** 0 emojis only, 1 + the story, 2 + a line or the letters. */
  clue: number
  got: Record<string, number>
  gained: Record<string, number>
  feed: { id: string; text?: string; got?: boolean }[]
  pts: Record<string, number>
  right: Record<string, number>
}

const REVEAL_MS = 6000
const WORTH = [10, 6, 3]

/** A title as people type it: no "the", no punctuation, numbers as digits. */
const key = (s: string) => norm(s).replace(/^the /, '').replace(/ the /g, ' ').replace(/\b(part|chapter) \w+$/, '').trim()

export function matches(m: Movie, guess: string) {
  const g = key(guess)
  if (!g) return false
  return [m.t, ...(m.a ?? [])].some(name => {
    const k = key(name)
    if (g === k) return true
    // A main title before a colon is enough ("Uri" for "Uri: The Surgical Strike").
    const head = key(name.split(':')[0])
    if (head.length >= 3 && g === head) return true
    const tol = k.length >= 12 ? 2 : k.length >= 6 ? 1 : 0
    return tol > 0 && distance(g, k) <= tol
  })
}

/** "Dil Chahta Hai" → "D__ C_____ H__". */
export const letters = (t: string) => t.replace(/[A-Za-z]/g, (c, i) => (i === 0 || /[^A-Za-z]/.test(t[i - 1]) ? c : '_'))

function open(g: Ctx<C>, s: S) {
  s.phase = 'guess'
  s.got = {}
  s.gained = {}
  s.feed = []
  s.clue = 0
  s.opened = g.now
  s.until = g.now + g.config.seconds * 1000
  schedule(g, s)
}

/** The next moment something happens: a new clue, or the end of the round. */
function schedule(g: Ctx<C>, s: S) {
  const span = s.until - s.opened
  const next = s.clue < 2 ? s.opened + Math.round(span * (s.clue + 1) / 3) : s.until
  g.wake(Math.min(next, s.until))
}

function reveal(g: Ctx<C>, s: S) {
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const movieguess: Game<S, C> = {
  setup(g) {
    const pack = g.config.pack
    const pool = pack === 'mixed' ? MOVIES : MOVIES.filter(m => m.l === (pack === 'hollywood' ? 'h' : 'b'))
    const s: S = { films: g.deal(`movies:${pack}`, pool, g.config.rounds), round: 0, phase: 'guess', opened: 0, until: 0, clue: 0, got: {}, gained: {}, feed: [], pts: {}, right: {} }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a !== 'guess' || s.phase !== 'guess' || s.got[id] !== undefined) return
    const text = String(m.text ?? '').slice(0, 60).trim()
    if (!text) return
    const film = s.films[s.round]
    if (matches(film, text)) {
      s.got[id] = g.now - s.opened
      const p = WORTH[s.clue]
      s.gained[id] = p
      s.pts[id] = (s.pts[id] ?? 0) + p
      s.right[id] = (s.right[id] ?? 0) + 1
      s.feed.push({ id, got: true })
      if (allIn(g, s.got)) reveal(g, s)
    } else {
      // Close guesses are told privately; wrong ones go to everyone (they are half the fun).
      const close = [film.t, ...(film.a ?? [])].some(n => distance(key(text), key(n)) <= 2 && key(n).length > 5)
      if (close) { g.emit({ k: 'close' }, id); g.quiet(); return }
      s.feed.push({ id, text })
      if (s.feed.length > 40) s.feed.shift()
    }
  },
  /** Someone's phone went: if everyone still here has played, the round need not wait for them. */
  away(g, s) { if (s.phase === 'guess' && allIn(g, s.got)) reveal(g, s) },
  tick(g, s) {
    if (s.phase === 'guess') {
      if (g.now >= s.until) return reveal(g, s)
      s.clue = Math.min(2, s.clue + 1)
      return schedule(g, s)
    }
    if (s.round + 1 >= s.films.length) return g.end(byPoints(s.pts, g.players, id => `${s.right[id] ?? 0}/${s.films.length} films`))
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const f = s.films[s.round]
    const reveal = s.phase === 'reveal'
    return {
      round: s.round, rounds: s.films.length, phase: s.phase, until: s.until, clue: s.clue, worth: WORTH[s.clue],
      emoji: f.e, story: s.clue >= 1 || reveal ? f.p : null, line: s.clue >= 2 || reveal ? f.d ?? null : null,
      letters: s.clue >= 2 && !f.d && !reveal ? letters(f.t) : null, year: s.clue >= 2 || reveal ? f.y : null,
      mine: s.got[id] !== undefined, got: Object.keys(s.got), feed: s.feed, pts: s.pts,
      title: reveal ? f.t : null, gained: reveal ? s.gained : null,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'guess' || s.got[id] !== undefined || g.rand() < 0.7) return null
    return { a: 'guess', text: g.rand() < 0.5 ? s.films[s.round].t : g.pick(['Sholay', 'Titanic', 'no idea', 'Dhoom']) }
  },
}
