// Connections: sixteen words hide four groups of four. Everyone solves the same board on their own; four mistakes
// and you are out. Points for every group, a bonus for finishing first.
import { norm, rank, type Ctx, type Game } from '../engine'
import { GROUPS, type Group } from '../content/connections'
import { allIn } from './util'

interface C { puzzles: number; seconds: number }
interface Board { groups: { name: string; words: string[]; level: number }[]; order: string[] }
interface Me { found: number[]; mistakes: number; tries: string[]; done: number | null }
interface S {
  boards: Board[]
  round: number
  phase: 'play' | 'reveal'
  opened: number
  until: number
  me: Record<string, Me>
  gained: Record<string, number>
  pts: Record<string, number>
  solved: Record<string, number>
  missed: Record<string, number>
}

export const MISTAKES = 4
const REVEAL_MS = 9000
const FINISH_BONUS = [5, 3, 2, 1]

/** Two groups can share a board unless they share a word or a theme (which would make the board ambiguous). */
const clash = (a: Group, b: Group) => a.tags.some(x => b.tags.includes(x)) || a.words.some(w => b.words.some(x => norm(x) === norm(w)))

/** Builds boards from the dealt groups, in order, skipping any group that would clash with the board so far. */
export function boards(g: Ctx<C>, n: number): Board[] {
  const out: Board[] = []
  let cur: Group[] = []
  const spare: Group[] = []
  // strict: at most two groups of one difficulty on a board. Clashing groups never share one.
  const take = (grp: Group, strict: boolean) => {
    if (cur.some(x => clash(x, grp)) || (strict && cur.filter(x => x.level === grp.level).length >= 2)) return false
    cur.push(grp)
    if (cur.length === 4) {
      // Shown as easiest to trickiest: yellow, green, blue, purple. Two groups of the same level still get their own colours.
      const groups = cur.sort((a, b) => a.level - b.level).map((x, i) => ({ name: x.name, words: g.shuffle(x.words.slice()).slice(0, 4), level: i + 1 }))
      out.push({ groups, order: g.shuffle(groups.flatMap(x => x.words)) })
      cur = []
    }
    return true
  }
  for (let k = 0; k < 10 && out.length < n; k++) {
    for (const grp of g.deal('connections', GROUPS, 12)) if (out.length < n && !take(grp, true)) spare.push(grp)
    // Groups passed over only to spread the difficulty can still finish a board.
    for (let i = 0; i < spare.length && out.length < n;) { if (take(spare[i], false)) spare.splice(i, 1); else i++ }
  }
  return out
}

function open(g: Ctx<C>, s: S) {
  s.phase = 'play'
  s.me = {}
  s.gained = {}
  s.opened = g.now
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

const mine = (s: S, id: string) => (s.me[id] ??= { found: [], mistakes: 0, tries: [], done: null })

function reveal(g: Ctx<C>, s: S) {
  const finishers = Object.entries(s.me).filter(([, m]) => m.found.length === 4).sort((a, b) => a[1].done! - b[1].done!)
  for (const [id, m] of Object.entries(s.me)) {
    let p = m.found.length * 5
    const at = finishers.findIndex(f => f[0] === id)
    if (at >= 0) p += FINISH_BONUS[at] ?? 0
    s.gained[id] = p
    s.pts[id] = (s.pts[id] ?? 0) + p
    if (m.found.length === 4) s.solved[id] = (s.solved[id] ?? 0) + 1
    s.missed[id] = (s.missed[id] ?? 0) + m.mistakes
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const connections: Game<S, C> = {
  setup(g) {
    const s: S = { boards: boards(g, g.config.puzzles), round: 0, phase: 'play', opened: 0, until: 0, me: {}, gained: {}, pts: {}, solved: {}, missed: {} }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    if (m.a !== 'guess' || s.phase !== 'play') return
    const me = mine(s, id)
    if (me.done !== null) return
    const words = Array.isArray(m.words) ? [...new Set(m.words.map(String))] : []
    const b = s.boards[s.round]
    if (words.length !== 4 || words.some(w => !b.order.includes(w))) return 'Pick four words'
    if (words.some(w => me.found.some(i => b.groups[i].words.includes(w)))) return 'One of those is already in a group'
    const key = words.slice().sort().join('|')
    if (me.tries.includes(key)) return 'You already tried those four'
    me.tries.push(key)
    const hit = b.groups.findIndex(gr => words.every(w => gr.words.includes(w)))
    if (hit >= 0) {
      me.found.push(hit)
      // The last group is obvious once three are found: it is filled in.
      if (me.found.length === 3) me.found.push([0, 1, 2, 3].find(i => !me.found.includes(i))!)
    } else {
      me.mistakes++
      const best = Math.max(...b.groups.map((gr, i) => (me.found.includes(i) ? 0 : words.filter(w => gr.words.includes(w)).length)))
      if (best === 3 && me.mistakes < MISTAKES) g.emit({ k: 'oneAway' }, id)
    }
    if (me.found.length === 4 || me.mistakes >= MISTAKES) me.done = g.now - s.opened
    const done = Object.fromEntries(Object.entries(s.me).filter(([, x]) => x.done !== null).map(([k]) => [k, 1]))
    if (allIn(g, done)) reveal(g, s)
  },
  /** Someone's phone went: if everyone still here has finished, the puzzle need not wait for them. */
  away(g, s) {
    if (s.phase !== 'play') return
    const done = Object.fromEntries(Object.entries(s.me).filter(([, x]) => x.done !== null).map(([k]) => [k, 1]))
    if (allIn(g, done)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'play') return reveal(g, s)
    if (s.round + 1 >= s.boards.length) {
      return g.end(rank(g.players.map(id => ({ id })), t => [-(s.pts[t.id] ?? 0), s.missed[t.id] ?? 0], t => s.pts[t.id] ?? 0,
        t => `${s.solved[t.id] ?? 0}/${s.boards.length} solved · ${s.missed[t.id] ?? 0} mistakes`))
    }
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const b = s.boards[s.round]
    const me = s.me[id] ?? { found: [], mistakes: 0, tries: [], done: null }
    const reveal = s.phase === 'reveal'
    return {
      round: s.round, rounds: s.boards.length, phase: s.phase, until: s.until, words: b.order,
      found: me.found.map(i => b.groups[i]), mistakes: me.mistakes, max: MISTAKES, out: me.done !== null && me.found.length < 4,
      finished: me.done !== null,
      progress: Object.fromEntries(g.players.map(p => [p, { found: s.me[p]?.found.length ?? 0, mistakes: s.me[p]?.mistakes ?? 0, done: s.me[p]?.done !== null && s.me[p]?.done !== undefined }])),
      pts: s.pts, groups: reveal ? b.groups : null, gained: reveal ? s.gained : null,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'play' || s.me[id]?.done != null || g.rand() < 0.5) return null
    const b = s.boards[s.round]
    const me = s.me[id]
    const left = b.groups.map((gr, i) => i).filter(i => !me?.found.includes(i))
    const pick = g.pick(left)
    // Right half the time; otherwise three right and one wrong.
    const words = b.groups[pick].words.slice()
    if (g.rand() < 0.5) {
      const other = b.order.filter(w => !words.includes(w) && !me?.found.some(i => b.groups[i].words.includes(w)))
      if (other.length) words[g.int(4)] = g.pick(other)
    }
    if (me?.tries.includes(words.slice().sort().join('|'))) return { a: 'guess', words: b.groups[pick].words }
    return { a: 'guess', words }
  },
}
