// Telephone: phrases turn into drawings and back as books pass around the room, then everyone watches the books.
import { byPoints, clean, type Ctx, type Game } from '../engine'
import { TELEPHONE_STARTS } from '../content/draw'
import { active, drawMsg, type Stroke } from './util'

interface C { writeSeconds: number; drawSeconds: number }
interface Entry { by: string; kind: 'text' | 'draw'; text?: string }
interface S {
  seats: string[]
  steps: number
  step: number
  phase: 'play' | 'show'
  until: number
  books: Entry[][] // book b was started by seats[b]
  texts: Record<string, string> // this step's typed entries
  done: Record<string, boolean> // this step: finished drawing or writing
  book: number // show: which book
  shown: number // show: entries of it visible
  likes: Record<string, string[]> // "book:entry" -> who liked it
  pts: Record<string, number>
}

const SHOW_MS = 9000 // each reveal step advances by itself after this, if nobody taps Next

const kindOf = (step: number): Entry['kind'] => (step % 2 === 0 ? 'text' : 'draw')
/** The book a seat works on at a step: books move one seat on each step. */
const bookFor = (s: S, seat: number) => (seat - s.step + s.seats.length * 16) % s.seats.length
const strokeKey = (step: number, id: string) => `d:${step}:${id}`

function open(g: Ctx<C>, s: S) {
  s.texts = {}
  s.done = {}
  const secs = kindOf(s.step) === 'text' ? g.config.writeSeconds : g.config.drawSeconds
  s.until = g.now + secs * 1000
  g.wake(s.until)
}

function close(g: Ctx<C>, s: S) {
  const kind = kindOf(s.step)
  s.seats.forEach((id, seat) => {
    const b = bookFor(s, seat)
    if (kind === 'text') {
      let text = s.texts[id]
      if (!text) text = s.step === 0 ? g.pick(TELEPHONE_STARTS) : '(no idea)'
      s.books[b].push({ by: id, kind, text })
    } else {
      s.books[b].push({ by: id, kind })
    }
  })
  s.step++
  if (s.step >= s.steps) {
    s.phase = 'show'
    s.book = 0
    s.shown = 1
    s.until = g.now + SHOW_MS
    g.wake(s.until)
    return
  }
  open(g, s)
}

function advance(g: Ctx<C>, s: S) {
  if (s.shown < s.books[s.book].length) s.shown++
  else if (s.book + 1 < s.books.length) { s.book++; s.shown = 1 }
  else return g.end(byPoints(s.pts, g.players, id => `${s.pts[id] ?? 0} likes`))
  s.until = g.now + SHOW_MS
  g.wake(s.until)
}

export const telephone: Game<S, C> = {
  setup(g) {
    const n = g.players.length
    // Every book visits every seat once, up to 10 steps (write, draw, write, draw…).
    const s: S = { seats: g.players.slice(), steps: Math.min(n, 10), step: 0, phase: 'play', until: 0, books: g.players.map(() => []), texts: {}, done: {}, book: 0, shown: 0, likes: {}, pts: {} }
    open(g, s)
    return s
  },
  act(g, s, id, m) {
    const seat = s.seats.indexOf(id)
    if (seat < 0) return
    if (s.phase === 'show') {
      if (m.a === 'next') {
        // The book's owner presents it; if they are not here, anyone can move on.
        const owner = s.seats[s.book]
        if (id !== owner && g.online.has(owner)) return 'The book\'s owner moves it on'
        return advance(g, s)
      }
      if (m.a === 'like') {
        const e = Number(m.e)
        const entry = s.books[s.book][e]
        if (!entry || e >= s.shown || entry.by === id) return
        const k = `${s.book}:${e}`
        const list = (s.likes[k] ??= [])
        const at = list.indexOf(id)
        if (at >= 0) { list.splice(at, 1); s.pts[entry.by] = (s.pts[entry.by] ?? 0) - 1 }
        else { list.push(id); s.pts[entry.by] = (s.pts[entry.by] ?? 0) + 1 }
      }
      return
    }
    const kind = kindOf(s.step)
    if (kind === 'text' && m.a === 'text') {
      const text = clean(m.text, 100)
      if (!text) return 'Write something'
      s.texts[id] = text
      s.done[id] = true
    } else if (kind === 'draw' && (m.a === 'line' || m.a === 'undo' || m.a === 'clear')) {
      if (s.done[id]) return 'You are done with this drawing'
      const key = strokeKey(s.step, id)
      const strokes = g.get<Stroke[]>(key) ?? []
      if (!drawMsg(strokes, m)) return
      g.put(key, strokes)
      g.quiet()
      g.lazy()
      return
    } else if (m.a === 'done') {
      s.done[id] = !s.done[id]
    } else return
    if (active(g).every(p => s.done[p])) close(g, s)
  },
  tick(g, s) {
    if (s.phase === 'play') return close(g, s)
    advance(g, s)
  },
  view(g, s, id) {
    const seat = s.seats.indexOf(id)
    if (s.phase === 'show') {
      const entries = s.books[s.book].slice(0, s.shown).map((e, i) => ({
        by: e.by, kind: e.kind, text: e.text, likes: s.likes[`${s.book}:${i}`] ?? [],
        strokes: e.kind === 'draw' ? g.get<Stroke[]>(strokeKey(i, e.by)) ?? [] : undefined,
      }))
      return { phase: 'show', book: s.book, books: s.books.length, owner: s.seats[s.book], entries, total: s.books[s.book].length, until: s.until, pts: s.pts }
    }
    const kind = kindOf(s.step)
    let prompt: Entry & { strokes?: Stroke[] } | null = null
    if (seat >= 0 && s.step > 0) {
      const prev = s.books[bookFor(s, seat)][s.step - 1]
      prompt = { ...prev, strokes: prev.kind === 'draw' ? g.get<Stroke[]>(strokeKey(s.step - 1, prev.by)) ?? [] : undefined }
    }
    return {
      phase: 'play', step: s.step, steps: s.steps, kind, until: s.until, seated: seat >= 0,
      prompt, mine: kind === 'text' ? s.texts[id] ?? null : g.get<Stroke[]>(strokeKey(s.step, id)) ?? [],
      done: s.done, doneMe: !!s.done[id],
    }
  },
  bot(g, s, id) {
    if (s.phase === 'show') return g.rand() < 0.5 ? { a: 'next' } : { a: 'like', e: 0 }
    if (s.done[id]) return null
    if (kindOf(s.step) === 'text') return { a: 'text', text: 'a cat ' + g.int(99) }
    return g.rand() < 0.5 ? { a: 'line', id: 1, c: 2, w: 6, p: [1, 2, 300, 400] } : { a: 'done' }
  },
}
