// Music Guess: hear two seconds of a Bollywood song and pick it from four. Halfway through, a five-second clip
// unlocks; answers after that are worth less.
import { byPoints, type Ctx, type Game } from '../engine'
import { SONGS, type Song } from '../content/songs'
import { allIn } from './util'

interface C { rounds: number; seconds: number }
interface Round { song: Song; choices: number[]; right: number; at: number }
interface S {
  rounds: Round[]
  round: number
  phase: 'listen' | 'reveal'
  opened: number
  until: number
  long: boolean
  /** Points each answer earns (10 on the short clip, 5 after, -1 wrong), and which choice it was. */
  picks: Record<string, number>
  chose: Record<string, number>
  gained: Record<string, number>
  pts: Record<string, number>
  right: Record<string, number>
}

const REVEAL_MS = 8000
export const SHORT = 2
export const LONG = 5

/** Three other songs from around the same years, so the era does not give it away. */
function choicesFor(g: Ctx<C>, song: Song): { choices: number[]; right: number } {
  const me = SONGS.indexOf(song)
  const near = (span: number) => SONGS.map((x, i) => i).filter(i => i !== me && SONGS[i].t !== song.t && Math.abs(SONGS[i].y - song.y) <= span)
  let pool = near(6)
  if (pool.length < 3) pool = near(100)
  const others = g.shuffle(pool).slice(0, 3)
  const choices = g.shuffle([me, ...others])
  return { choices, right: choices.indexOf(me) }
}

function open(g: Ctx<C>, s: S) {
  s.phase = 'listen'
  s.picks = {}
  s.chose = {}
  s.gained = {}
  s.long = false
  s.opened = g.now
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.opened + Math.round((s.until - s.opened) / 2))
}

function reveal(g: Ctx<C>, s: S) {
  for (const [id, p] of Object.entries(s.picks)) {
    if (p < 0) continue
    s.gained[id] = p
    s.pts[id] = (s.pts[id] ?? 0) + p
    s.right[id] = (s.right[id] ?? 0) + 1
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const musicguess: Game<S, C> = {
  setup(g) {
    const songs = g.deal('music', SONGS, g.config.rounds)
    // Each round plays from a point inside Apple's 30-second preview, the same point for everyone.
    const rounds = songs.map(song => ({ song, ...choicesFor(g, song), at: 3 + g.int(18) }))
    const s: S = { rounds, round: 0, phase: 'listen', opened: 0, until: 0, long: false, picks: {}, chose: {}, gained: {}, pts: {}, right: {} }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a !== 'pick' || s.phase !== 'listen' || s.picks[id] !== undefined) return
    const i = Number(m.i)
    if (!(i >= 0 && i < 4)) return
    s.picks[id] = i === s.rounds[s.round].right ? (s.long ? 5 : 10) : -1
    s.chose[id] = i
    if (allIn(g, s.picks)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'listen') {
      if (!s.long && g.now < s.until) { s.long = true; g.wake(s.until); return }
      return reveal(g, s)
    }
    if (s.round + 1 >= s.rounds.length) return g.end(byPoints(s.pts, g.players, id => `${s.right[id] ?? 0}/${s.rounds.length} songs`))
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const r = s.rounds[s.round]
    const reveal = s.phase === 'reveal'
    return {
      round: s.round, rounds: s.rounds.length, phase: s.phase, until: s.until, long: s.long, clip: s.long ? LONG : SHORT,
      preview: r.song.preview, at: r.at,
      choices: r.choices.map(i => ({ t: SONGS[i].t, f: SONGS[i].f })), mine: s.chose[id] ?? null, answered: Object.keys(s.picks), pts: s.pts,
      right: reveal ? r.right : null, gained: reveal ? s.gained : null, picks: reveal ? s.chose : null,
      song: reveal ? { t: r.song.t, f: r.song.f, y: r.song.y, artist: r.song.artist, link: r.song.link } : null,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'listen' || s.picks[id] !== undefined || g.rand() < 0.6) return null
    return { a: 'pick', i: g.rand() < 0.5 ? s.rounds[s.round].right : g.int(4) }
  },
}
