// Code Words: two teams, two spymasters, 25 words. Find your agents, avoid the assassin.
import { clean, norm, type Ctx, type Game } from '../engine'
import { board } from '../content/codewords'

type Team = 'red' | 'blue'
type Card = Team | 'neutral' | 'assassin'
interface C { timer: number; pack: string; black: number }
interface S {
  phase: 'teams' | 'play' | 'over'
  team: Record<string, Team>
  spy: Record<Team, string | null>
  words: string[]
  keys: Card[]
  open: boolean[]
  first: Team
  turn: Team
  clue: { word: string; n: number } | null
  left: number // guesses left this turn
  marks: Record<number, string[]>
  log: { team: Team; clue: string; n: number; picks: number[] }[]
  winner: Team | null
  why: string
  until: number
  // Each turn change, so phones can show who is up now and why the turn moved.
  turnN: number
  turnAt: number
  handoff: { team: Team; why: 'time' | 'pass' | 'miss' | 'done'; word?: string; card?: Card } | null
  clueAt: number
  // The card that ended the game, for the finale before the results.
  final: { i: number; card: Card; by: Team; at: number } | null
}

const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red')
const guessers = (s: S, t: Team) => Object.keys(s.team).filter(id => s.team[id] === t && s.spy[t] !== id)

function deal(g: Ctx<C>, s: S) {
  s.words = board(g.config.pack, g.deal, g.shuffle)
  s.first = g.rand() < 0.5 ? 'red' : 'blue'
  // More black cards take the place of neutral ones, so the teams keep 9 and 8 agents.
  const black = Math.min(4, Math.max(1, Math.round(Number(g.config.black) || 1)))
  const keys: Card[] = [...Array(9).fill(s.first), ...Array(8).fill(other(s.first)), ...Array(8 - black).fill('neutral'), ...Array(black).fill('assassin')]
  s.keys = g.shuffle(keys)
  s.open = Array(25).fill(false)
  s.turn = s.first
}

function timer(g: Ctx<C>, s: S) {
  s.until = g.config.timer ? g.now + Number(g.config.timer) * 1000 : 0
  g.wake(s.until)
}

function newTurn(g: Ctx<C>, s: S) {
  s.turnN = (s.turnN ?? 0) + 1
  s.turnAt = g.now
  timer(g, s)
}

function endTurn(g: Ctx<C>, s: S, why: 'time' | 'pass' | 'miss' | 'done', i?: number) {
  s.handoff = { team: s.turn, why, ...(i === undefined ? {} : { word: s.words[i], card: s.keys[i] }) }
  s.turn = other(s.turn)
  s.clue = null
  s.left = 0
  s.marks = {}
  newTurn(g, s)
}

/** The winning card stays on screen for a moment (phones play the finale), then the results come. */
const FINALE = 4500

function finish(g: Ctx<C>, s: S, winner: Team, why: string, i: number) {
  s.phase = 'over'
  s.winner = winner
  s.why = why
  s.final = { i, card: s.keys[i], by: s.turn, at: g.now }
  s.clue = null
  s.until = g.now + FINALE
  g.wake(s.until)
}

function results(g: Ctx<C>, s: S) {
  const winner = s.winner!, why = s.why
  g.wake(0)
  g.end(g.players.map(id => ({ id, place: s.team[id] === winner ? 1 : 2, score: s.team[id] === winner ? 'Won' : 'Lost', detail: `${s.team[id] ?? ''}${s.spy[s.team[id]] === id ? ' spymaster' : ''}` })),
    { winner, why, words: s.words, keys: s.keys })
}

/**
 * New random teams that can be played: sizes within one of each other, a spymaster on each side who is here to give
 * clues (so each team has a spymaster and, from four players, at least one guesser), and never the same teams and
 * spymasters as before when another split exists.
 */
function shuffle(g: Ctx<C>, s: S) {
  const same = (team: Record<string, Team>, spy: Record<Team, string | null>) =>
    spy.red === s.spy.red && spy.blue === s.spy.blue && g.players.every(id => team[id] === s.team[id])
  for (let tries = 0; ; tries++) {
    // Players who are here first, in a random order, so they are split evenly and the two spymasters come from them.
    const here = g.shuffle(g.players.filter(id => g.online.has(id)))
    const ids = [...here, ...g.shuffle(g.players.filter(id => !g.online.has(id)))]
    const a: Team = g.rand() < 0.5 ? 'red' : 'blue'
    const team: Record<string, Team> = {}
    ids.forEach((id, i) => { team[id] = i % 2 === 0 ? a : other(a) })
    const spy = { [a]: ids[0] ?? null, [other(a)]: ids[1] ?? null } as Record<Team, string | null>
    if (!same(team, spy) || tries >= 20) { s.team = team; s.spy = spy; return }
  }
}

/** Who shuffles and starts: the host, or the first player here when the host is not in this game. */
const boss = (g: Ctx<C>) => (g.host && g.players.includes(g.host) && g.online.has(g.host) ? g.host : g.players.find(id => g.online.has(id)) ?? null)

/** Why the teams cannot start yet, if they cannot. */
function notReady(g: Ctx<C>, s: S) {
  for (const team of ['red', 'blue'] as Team[]) {
    const name = team === 'red' ? 'Red' : 'Blue', spy = s.spy[team]
    if (!spy) return `${name} needs a spymaster`
    if (!g.online.has(spy)) return `${name}'s spymaster is not here. Pick another`
    if (!guessers(s, team).length) return `${name} needs at least one guesser`
  }
}

export const codewords: Game<S, C> = {
  setup(g) {
    const s = { phase: 'teams', team: {}, spy: { red: null, blue: null }, clue: null, left: 0, marks: {}, log: [], winner: null, why: '', until: 0, turnN: 0, turnAt: 0, handoff: null, clueAt: 0, final: null } as unknown as S
    shuffle(g, s)
    deal(g, s)
    return s
  },
  join(g, s, id) {
    // Only while the teams are being picked; after that, newcomers watch.
    if (s.phase !== 'teams') return false
    const red = Object.values(s.team).filter(t => t === 'red').length, blue = Object.values(s.team).length - red
    s.team[id] = red <= blue ? 'red' : 'blue'
    return true
  },
  leave(g, s, id) {
    const t = s.team[id]
    delete s.team[id]
    if (t && s.spy[t] === id) s.spy[t] = guessers(s, t)[0] ?? null
  },
  act(g, s, id, m) {
    const t = s.team[id]
    if (s.phase === 'teams') {
      if (m.a === 'team' && (m.team === 'red' || m.team === 'blue')) {
        if (s.spy[t] === id) s.spy[t] = null
        s.team[id] = m.team
      } else if (m.a === 'spy') {
        s.spy[t] = s.spy[t] === id ? null : id
      } else if (m.a === 'shuffle' || m.a === 'go') {
        // Everyone picks their own team and role; shuffling and starting are the host's.
        if (id !== boss(g)) return 'Only the host can do that'
        if (m.a === 'shuffle') return shuffle(g, s)
        const why = notReady(g, s)
        if (why) return why
        s.phase = 'play'
        newTurn(g, s)
      }
      return
    }
    if (s.phase !== 'play' || !t) return
    if (m.a === 'clue') {
      if (s.spy[s.turn] !== id) return 'Only the spymaster on turn gives the clue'
      if (s.clue) return
      const word = clean(m.word, 24)
      const n = Math.round(Number(m.n))
      if (!/^[\p{L}'-]+$/u.test(word)) return 'One word, no spaces'
      if (!(n >= 0 && n <= 9)) return 'Pick a number from 0 to 9'
      const w = norm(word)
      if (s.words.some((x, i) => !s.open[i] && (norm(x).includes(w) || w.includes(norm(x))))) return 'Your clue cannot be (part of) a word on the board'
      s.clue = { word, n }
      s.clueAt = g.now
      // 0 means "unlimited": guess as many as you like.
      s.left = n === 0 ? 25 : n + 1
      s.log.push({ team: s.turn, clue: word, n, picks: [] })
      return
    }
    const mine = t === s.turn && s.spy[t] !== id
    if (m.a === 'mark') {
      if (!mine || !s.clue) return
      const i = Number(m.i)
      if (!(i >= 0 && i < 25) || s.open[i]) return
      const list = (s.marks[i] ??= [])
      const at = list.indexOf(id)
      if (at >= 0) list.splice(at, 1)
      else list.push(id)
      return
    }
    if (m.a === 'pick') {
      if (!mine) return 'Not your turn'
      if (!s.clue) return 'Wait for the clue'
      const i = Number(m.i)
      if (!(i >= 0 && i < 25) || s.open[i]) return
      s.open[i] = true
      delete s.marks[i]
      s.log[s.log.length - 1].picks.push(i)
      const card = s.keys[i]
      if (card === 'assassin') return finish(g, s, other(s.turn), `${s.turn === 'red' ? 'Red' : 'Blue'} hit a black card`, i)
      for (const team of ['red', 'blue'] as Team[]) {
        if (s.keys.every((k, j) => k !== team || s.open[j])) return finish(g, s, team, `${team === 'red' ? 'Red' : 'Blue'} found all its agents`, i)
      }
      if (card !== s.turn) return endTurn(g, s, 'miss', i)
      s.left--
      if (s.left <= 0) endTurn(g, s, 'done')
      return
    }
    if (m.a === 'pass') {
      if (!mine || !s.clue) return
      if (s.log[s.log.length - 1].picks.length === 0) return 'Make at least one guess first'
      return endTurn(g, s, 'pass')
    }
  },
  /** Someone's phone went: a spymaster's key passes to a teammate who is here, so their team is not stuck. */
  away(g, s, id) {
    const t = s.team[id]
    if (!t || s.spy[t] !== id || s.phase === 'teams') return
    const sub = guessers(s, t).find(p => g.online.has(p))
    if (sub) s.spy[t] = sub
  },
  tick(g, s) {
    if (s.phase === 'play' && s.until && g.now >= s.until) endTurn(g, s, 'time')
    else if (s.phase === 'over' && s.until && g.now >= s.until) results(g, s)
  },
  view(g, s, id) {
    const t = s.team[id]
    const spy = !!t && s.spy[t] === id
    const over = s.phase === 'over'
    return {
      phase: s.phase, team: s.team, spy: s.spy, you: { team: t ?? null, spy }, boss: s.phase === 'teams' ? boss(g) : null,
      words: s.words, open: s.open,
      // Spymasters see the key; everyone else only the cards turned over.
      keys: s.keys.map((k, i) => (spy || over || s.open[i] ? k : null)),
      turn: s.turn, first: s.first, clue: s.clue, left: s.left, marks: s.marks, log: s.log, winner: s.winner, why: s.why, until: s.until,
      turnN: s.turnN, turnAt: s.turnAt, handoff: s.handoff, clueAt: s.clueAt, final: s.final, black: s.keys.filter(k => k === 'assassin').length,
      remaining: { red: s.keys.filter((k, i) => k === 'red' && !s.open[i]).length, blue: s.keys.filter((k, i) => k === 'blue' && !s.open[i]).length },
    }
  },
  bot(g, s, id) {
    const t = s.team[id]
    if (s.phase === 'teams') return id === boss(g) ? { a: g.rand() < 0.2 ? 'shuffle' : 'go' } : null
    if (s.phase !== 'play' || t !== s.turn) return null
    if (s.spy[t] === id) return s.clue ? null : { a: 'clue', word: 'zzq' + 'abcdefgh'[g.int(8)], n: 1 + g.int(3) }
    if (!s.clue) return null
    const closed = s.open.map((o, i) => (o ? -1 : i)).filter(i => i >= 0)
    return { a: 'pick', i: g.pick(closed) }
  },
}
