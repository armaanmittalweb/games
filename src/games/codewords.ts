// Code Words: two teams, two spymasters, 25 words. Find your agents, avoid the assassin.
import { clean, norm, type Ctx, type Game } from '../engine'
import { board } from '../content/codewords'

type Team = 'red' | 'blue'
type Card = Team | 'neutral' | 'assassin'
interface C { timer: number; pack: string }
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
}

const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red')
const guessers = (s: S, t: Team) => Object.keys(s.team).filter(id => s.team[id] === t && s.spy[t] !== id)

function deal(g: Ctx<C>, s: S) {
  s.words = board(g.config.pack, g.shuffle)
  s.first = g.rand() < 0.5 ? 'red' : 'blue'
  const keys: Card[] = [...Array(9).fill(s.first), ...Array(8).fill(other(s.first)), ...Array(7).fill('neutral'), 'assassin']
  s.keys = g.shuffle(keys)
  s.open = Array(25).fill(false)
  s.turn = s.first
}

function timer(g: Ctx<C>, s: S) {
  s.until = g.config.timer ? g.now + Number(g.config.timer) * 1000 : 0
  g.wake(s.until)
}

function endTurn(g: Ctx<C>, s: S) {
  s.turn = other(s.turn)
  s.clue = null
  s.left = 0
  s.marks = {}
  timer(g, s)
}

function finish(g: Ctx<C>, s: S, winner: Team, why: string) {
  s.phase = 'over'
  s.winner = winner
  s.why = why
  g.wake(0)
  g.end(g.players.map(id => ({ id, place: s.team[id] === winner ? 1 : 2, score: s.team[id] === winner ? 'Won' : 'Lost', detail: `${s.team[id] ?? ''}${s.spy[s.team[id]] === id ? ' spymaster' : ''}` })),
    { winner, why, words: s.words, keys: s.keys })
}

function balance(g: Ctx<C>, s: S) {
  const ids = g.shuffle(g.players.slice())
  s.team = {}
  ids.forEach((id, i) => { s.team[id] = i % 2 === 0 ? 'red' : 'blue' })
  s.spy = { red: ids[0] ?? null, blue: ids[1] ?? null }
}

export const codewords: Game<S, C> = {
  setup(g) {
    const s = { phase: 'teams', team: {}, spy: { red: null, blue: null }, clue: null, left: 0, marks: {}, log: [], winner: null, why: '', until: 0 } as unknown as S
    balance(g, s)
    deal(g, s)
    return s
  },
  join(g, s, id) {
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
      } else if (m.a === 'shuffle') {
        balance(g, s)
      } else if (m.a === 'go') {
        for (const team of ['red', 'blue'] as Team[]) {
          if (!s.spy[team]) return `${team === 'red' ? 'Red' : 'Blue'} needs a spymaster`
          if (!guessers(s, team).length) return `${team === 'red' ? 'Red' : 'Blue'} needs at least one guesser`
        }
        s.phase = 'play'
        timer(g, s)
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
      if (card === 'assassin') return finish(g, s, other(s.turn), `${s.turn === 'red' ? 'Red' : 'Blue'} found the assassin`)
      for (const team of ['red', 'blue'] as Team[]) {
        if (s.keys.every((k, j) => k !== team || s.open[j])) return finish(g, s, team, `${team === 'red' ? 'Red' : 'Blue'} found all its agents`)
      }
      if (card !== s.turn) return endTurn(g, s)
      s.left--
      if (s.left <= 0) endTurn(g, s)
      return
    }
    if (m.a === 'pass') {
      if (!mine || !s.clue) return
      if (s.log[s.log.length - 1].picks.length === 0) return 'Make at least one guess first'
      return endTurn(g, s)
    }
  },
  tick(g, s) {
    if (s.phase === 'play' && s.until && g.now >= s.until) endTurn(g, s)
  },
  view(g, s, id) {
    const t = s.team[id]
    const spy = !!t && s.spy[t] === id
    const over = s.phase === 'over'
    return {
      phase: s.phase, team: s.team, spy: s.spy, you: { team: t ?? null, spy },
      words: s.words, open: s.open,
      // Spymasters see the key; everyone else only the cards turned over.
      keys: s.keys.map((k, i) => (spy || over || s.open[i] ? k : null)),
      turn: s.turn, first: s.first, clue: s.clue, left: s.left, marks: s.marks, log: s.log, winner: s.winner, why: s.why, until: s.until,
      remaining: { red: s.keys.filter((k, i) => k === 'red' && !s.open[i]).length, blue: s.keys.filter((k, i) => k === 'blue' && !s.open[i]).length },
    }
  },
  bot(g, s, id) {
    const t = s.team[id]
    if (s.phase === 'teams') return { a: 'go' }
    if (s.phase !== 'play' || t !== s.turn) return null
    if (s.spy[t] === id) return s.clue ? null : { a: 'clue', word: 'zzq' + 'abcdefgh'[g.int(8)], n: 1 + g.int(3) }
    if (!s.clue) return null
    const closed = s.open.map((o, i) => (o ? -1 : i)).filter(i => i >= 0)
    return { a: 'pick', i: g.pick(closed) }
  },
}
