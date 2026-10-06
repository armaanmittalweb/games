import { DurableObject } from 'cloudflare:workers'
import type { Stats } from './stats'
import type { GameEnd } from './analytics'
import { GAMES } from './games'
import { META, settings, type Mood } from './catalog'
import { MOODS, LENGTHS, cuts, placePoints, plan, swap, type Length, type Night } from './night'
import { dealAt, rng, clean, type Ctx, type Standing } from './engine'

interface Env { STATS: DurableObjectNamespace<Stats> }

interface Member {
  id: string; secret: string; name: string; joinedAt: number; color: number
  /** For the Switchboard only, never sent to players: the browser's anonymous visitor id, and an id that means something in this room only. */
  vid?: string; pid?: string
}

interface Inst {
  id: string
  n: number
  config: Record<string, string | number>
  players: string[]
  s: unknown
  wake: number
  startedAt: number
  endedAt: number
  standings: Standing[] | null
  summary?: unknown
  night: boolean
  /** When the host started it. startedAt is when play began, after the rules. */
  chosen?: number
  /** The rules, shown to everyone before play. The game is set up (and its clock starts) only once this ends. */
  intro?: { until: number; ready: string[] }
  /** On the results screen: who has said they are up for another game, so the host can see the room is ready. */
  again?: string[]
  /** Counted for the Switchboard: moves, errors, players whose connection dropped and players who came back. */
  q?: { acts: number; errs: number; dropped: string[]; back: string[]; readyAll: boolean }
}

interface State {
  v: 2
  code: string
  host: string | null
  members: Record<string, Member>
  touched: number
  phase: 'lobby' | 'game' | 'results'
  pick: string
  configs: Record<string, Record<string, string | number>>
  inst: Inst | null
  seq: number
  /** The room's leaderboard across every game played in it. */
  totals: Record<string, { pts: number; wins: number; games: number }>
  history: { id: string; at: number; winners: string[] }[]
  night: Night | null
  /** How far into each content pool this room has dealt (see Ctx.deal). */
  decks?: Record<string, number>
  /** A random id for this room, for the Switchboard. Codes are used again once a room closes; this never is. */
  rid?: string
  /** When each player's connection last dropped, to tell whether they came back. */
  drops?: Record<string, number>
}

interface Chat { id: string; text: string; at: number }

const MAX_MEMBERS = 30
const KEEP_MS = 24 * 3600_000
const LAZY_MS = 4000
const COLORS = 12
/** How long the rules stay up before a game, unless everyone closes them first. */
const INTRO_MS = 30_000
/** A player back within this long after their connection dropped counts as reconnected. */
const REJOIN_MS = 120_000
// Close codes a player chooses (leaving, closing the tab, opened elsewhere, removed); anything else is a dropped line.
const CHOSEN_CLOSE = new Set([1000, 1001, 1005, 4000, 4001])

const hex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('')
const idOk = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9]{6,40}$/i.test(x)

const attached = (ws: WebSocket) => (ws.deserializeAttachment() as { id?: string } | null)?.id

/** A room saved while a game that has since been taken off the site was picked or playing goes back to its lobby. */
function retire(s: State) {
  if (s.inst && !GAMES[s.inst.id]) { s.inst = null; s.phase = 'lobby' }
  if (!GAMES[s.pick]) s.pick = 'draw'
  s.history = s.history.filter(h => GAMES[h.id])
  if (s.night && [...s.night.plan, ...s.night.rounds.map(r => r.id)].some(id => !GAMES[id])) s.night = null
  return s
}

export class Room extends DurableObject<Env> {
  s: State | null = null
  chat: Chat[] = []
  blobs = new Map<string, unknown>()
  dirtyBlobs = new Set<string>()
  r = rng()
  /** Per socket: the last game view sent, so an unchanged view is not sent again. */
  sent = new WeakMap<WebSocket, string>()
  reports: ((stats: DurableObjectStub<Stats>) => Promise<unknown>)[] = []
  /** The site's place in each content pool, read when a game starts, and the places this room has moved to since. */
  site: Record<string, number> = {}
  moved: Record<string, number> = {}
  // Set while handling one message:
  emits: { msg: unknown; to?: string | string[] }[] = []
  isQuiet = false
  isLazy = false
  ended: { standings: Standing[]; summary?: unknown } | null = null
  dirty = false
  lastSave = 0
  /** Who was online, and in which phase, when the Stats object last heard (it shows who is on right now). */
  lastPresence = ''

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get<State>('s')
      this.s = s && s.v === 2 ? retire(s) : null
      this.chat = (await ctx.storage.get<Chat[]>('chat')) ?? []
      for (const [k, v] of await ctx.storage.list({ prefix: 'b:' })) this.blobs.set(k.slice(2), v)
    })
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/init') {
      if (this.s) return new Response('taken', { status: 409 })
      const now = Date.now()
      // A room from before game nights (one Wordle room per object) is replaced.
      await this.ctx.storage.deleteAll()
      this.s = {
        v: 2, code: url.searchParams.get('code') ?? '', host: null, members: {}, touched: now, phase: 'lobby', pick: 'draw',
        configs: {}, inst: null, seq: 0, totals: {}, history: [], night: null, rid: hex(8),
      }
      const code = this.s.code, rid = this.s.rid
      this.reports.push(st => st.roomCreated(code, rid))
      await this.save()
      await this.flush()
      return new Response('ok')
    }
    if (!this.s) return new Response('no such room', { status: 404 })
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  // ---------- game plumbing ----------

  ctxFor(inst: Inst, now: number): Ctx {
    const s = this.s!
    const names: Record<string, string> = {}, colors: Record<string, number> = {}
    for (const m of Object.values(s.members)) { names[m.id] = m.name; colors[m.id] = m.color }
    // Players removed from the room keep their name in a game they were part of.
    for (const id of inst.players) names[id] ??= 'Someone'
    return {
      now, config: inst.config, players: inst.players, names, colors, online: this.online(),
      ...this.r,
      deal: <T>(key: string, items: readonly T[], n: number) => {
        const d = (s.decks ??= {})
        const at = Math.max(d[key] ?? 0, this.site[key] ?? 0)
        d[key] = this.site[key] = this.moved[key] = at + Math.min(n, items.length)
        return dealAt(key, items, n, at)
      },
      wake: at => { inst.wake = at },
      end: (standings, summary) => { this.ended = { standings, summary } },
      emit: (msg, to) => { this.emits.push({ msg, to }) },
      quiet: () => { this.isQuiet = true },
      lazy: () => { this.isLazy = true },
      put: (k, v) => { this.blobs.set(k, v); this.dirtyBlobs.add(k) },
      get: <T>(k: string) => this.blobs.get(k) as T | undefined,
    }
  }

  /** Runs a game function and applies the ending if it produced one. */
  run<T>(fn: (g: Ctx) => T, now: number): T | undefined {
    const s = this.s!
    const inst = s.inst
    if (!inst || s.phase !== 'game') return
    let out: T
    try {
      out = fn(this.ctxFor(inst, now))
    } catch (e) {
      console.error('game', inst.id, e)
      if (inst.q) inst.q.errs++
      return 'Something went wrong. Try that again.' as T
    }
    if (this.ended) {
      const e = this.ended
      this.ended = null
      this.finish(inst, e.standings, e.summary, now)
      this.isQuiet = false
      this.isLazy = false
    }
    return out
  }

  /** Lets due deadlines fire. Returns whether any did. */
  due(now: number) {
    const s = this.s!
    let fired = false
    for (let i = 0; i < 20; i++) {
      const inst = s.inst
      if (!inst || s.phase !== 'game' || !inst.wake || now < inst.wake) break
      inst.wake = 0
      fired = true
      if (inst.intro) { this.begin(inst, now); continue }
      const game = GAMES[inst.id]
      this.run(g => game.tick?.(g, inst.s), now)
    }
    return fired
  }

  /** Picks the game and its players, then shows everyone the rules; begin() sets the game up after that. */
  start(id: string, config: Record<string, string | number>, seats: string[], now: number, night: boolean) {
    const s = this.s!
    for (const k of this.blobs.keys()) this.dirtyBlobs.add(k)
    this.blobs.clear()
    const inst: Inst = {
      id, n: ++s.seq, config, players: seats.slice(), s: null, wake: now + INTRO_MS, startedAt: 0, chosen: now, endedAt: 0, standings: null, night,
      intro: { until: now + INTRO_MS, ready: [] }, q: { acts: 0, errs: 0, dropped: [], back: [], readyAll: false },
    }
    s.inst = inst
    s.phase = 'game'
    const code = s.code, count = seats.length
    const a = { rid: (s.rid ??= hex(8)), gid: `${s.rid}:${inst.n}`, game: id, seq: inst.n, players: count, night }
    this.reports.push(st => st.started(code, id, count, a))
  }

  /** The rules are done (everyone closed them, or time ran out): the game starts now, with its full time. */
  begin(inst: Inst, now: number) {
    const s = this.s!
    const intro = inst.intro
    if (!intro || s.inst !== inst) return
    delete inst.intro
    inst.wake = 0
    inst.players = inst.players.filter(id => s.members[id])
    const meta = META[inst.id]
    if (inst.players.length < meta.min) {
      if (inst.night && s.night && !s.night.done) s.night.idx--
      const a = this.endInfo(inst, 'aborted')
      this.reports.push(st => st.aborted(a))
      s.inst = null
      s.phase = 'lobby'
      const wire = JSON.stringify({ t: 'error', msg: `${meta.name} needs at least ${meta.min} players` })
      for (const ws of this.ctx.getWebSockets()) try { ws.send(wire) } catch { /* closing */ }
      return
    }
    if (inst.q) inst.q.readyAll = inst.players.every(id => intro.ready.includes(id))
    inst.startedAt = now
    inst.s = GAMES[inst.id].setup(this.ctxFor(inst, now))
    if (this.ended) { const e = this.ended; this.ended = null; this.finish(inst, e.standings, e.summary, now) }
  }

  /** Starts the game early once every seated player who is here has closed the rules. */
  readyCheck(inst: Inst, now: number, except?: WebSocket) {
    if (!inst.intro) return
    const online = this.online(except)
    const here = inst.players.filter(id => online.has(id))
    if (here.length && here.every(id => inst.intro!.ready.includes(id))) this.begin(inst, now)
  }

  endInfo(inst: Inst, outcome: GameEnd['outcome']): GameEnd {
    const s = this.s!
    const q = inst.q ?? { acts: 0, errs: 0, dropped: [], back: [], readyAll: false }
    return {
      gid: `${s.rid}:${inst.n}`, rid: s.rid ?? '', outcome, began: inst.startedAt, players: inst.players.length, readyAll: q.readyAll,
      acts: q.acts, errs: q.errs, dropped: q.dropped.length, rejoined: q.back.length,
    }
  }

  finish(inst: Inst, standings: Standing[], summary: unknown, now: number) {
    const s = this.s!
    inst.standings = standings
    inst.summary = summary
    inst.endedAt = now
    inst.wake = 0
    s.phase = 'results'
    for (const st of standings) {
      const t = (s.totals[st.id] ??= { pts: 0, wins: 0, games: 0 })
      t.pts += placePoints(st.place)
      t.games++
      if (st.place === 1) t.wins++
    }
    s.history.unshift({ id: inst.id, at: now, winners: standings.filter(x => x.place === 1).map(x => x.id) })
    s.history.length = Math.min(s.history.length, 20)
    const n = s.night
    if (inst.night && n && !n.done) {
      const pts: Record<string, number> = {}
      for (const st of standings) { pts[st.id] = placePoints(st.place); n.points[st.id] = (n.points[st.id] ?? 0) + pts[st.id] }
      const round = { id: inst.id, points: pts, out: [] as string[] }
      n.rounds.push(round)
      const last = n.idx >= n.plan.length - 1
      if (n.length === 'tournament') {
        if (last) {
          n.champions = standings.filter(x => x.place === 1).map(x => x.id)
          n.done = true
        } else {
          // Keep the top of the night's table; anyone level with the last place kept stays in too.
          const target = cuts(n.alive.length)[1] ?? 2
          const sorted = n.alive.slice().sort((a, b) => (n.points[b] ?? 0) - (n.points[a] ?? 0))
          const bar = n.points[sorted[target - 1]] ?? 0
          const keep = sorted.filter((id, i) => i < target || (n.points[id] ?? 0) === bar)
          round.out = n.alive.filter(id => !keep.includes(id))
          n.alive = n.alive.filter(id => keep.includes(id))
        }
      } else if (last && n.length !== 'endless') {
        n.done = true
        const best = Math.max(...Object.values(n.points))
        n.champions = Object.keys(n.points).filter(id => n.points[id] === best)
      }
    }
    const stats = (summary as { stats?: { guesses?: number; solved?: number } } | undefined)?.stats
    const code = s.code, a = this.endInfo(inst, 'done')
    this.reports.push(st => st.finished(code, stats?.guesses ?? 0, stats?.solved ?? 0, a))
  }

  seatsFor(id: string): string[] | string {
    const s = this.s!
    const meta = META[id]
    const online = this.online()
    let seats = Object.values(s.members).filter(m => online.has(m.id)).sort((a, b) => a.joinedAt - b.joinedAt).map(m => m.id)
    const n = s.night
    if (n && !n.done && n.length === 'tournament' && n.idx >= 0) seats = seats.filter(id => n.alive.includes(id))
    if (seats.length < meta.min) return `${meta.name} needs at least ${meta.min} players`
    return seats.slice(0, meta.max)
  }

  /** Starts the night's next game, swapping it for one that fits if the room has changed size. */
  nightNext(now: number): string | void {
    const s = this.s!
    const n = s.night!
    if (n.done) return
    n.idx++
    if (n.length === 'endless' && n.idx >= n.plan.length) n.plan.push(...plan(this.online().size, 'endless', n.moods, this.r.rand, n.plan.slice(-6)))
    if (n.idx >= n.plan.length) { n.done = true; return }
    let id = n.plan[n.idx]
    let seats = this.seatsFor(id)
    const count = typeof seats === 'string' ? this.online().size : seats.length
    if (typeof seats === 'string' || count > META[id].max) {
      const alt = swap(n, n.idx, count, this.r.rand)
      if (alt) { n.plan[n.idx] = alt; id = alt; seats = this.seatsFor(id) }
    }
    if (typeof seats === 'string') { n.idx--; return seats }
    this.start(id, settings(id, META[id].night), seats, now, true)
  }

  // ---------- messages ----------

  reset() {
    this.emits = []
    this.isQuiet = false
    this.isLazy = false
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const s = this.s
    if (!s || typeof raw !== 'string' || raw.length > 64_000) return
    let m: Record<string, unknown>
    try { m = JSON.parse(raw) } catch { return }
    if (s.phase === 'game' && s.inst?.intro && (m.t === 'ready' || m.t === 'kick' || Date.now() >= s.inst.wake)) await this.readDecks()
    const now = Date.now()
    s.touched = now
    this.reset()
    const me = attached(ws)
    const err = (msg: string) => { try { ws.send(JSON.stringify({ t: 'error', msg })) } catch { /* closed */ } }
    const fired = this.due(now)

    if (m.t === 'join') {
      const id = String(m.id ?? '').slice(0, 40), secret = String(m.secret ?? '').slice(0, 80)
      let name = clean(m.name, 16)
      if (!id || !secret) return err('Missing player id')
      let p = s.members[id]
      if (p && p.secret !== secret) return err('That player id is taken')
      if (!p) {
        if (!name) return err('Pick a name')
        if (Object.keys(s.members).length >= MAX_MEMBERS) return err(`Room is full (${MAX_MEMBERS} players)`)
        const taken = new Set(Object.values(s.members).map(q => q.name.toLowerCase()))
        for (let k = 2; taken.has(name.toLowerCase()); k++) name = `${name.slice(0, 13)} ${k}`
        const used = new Set(Object.values(s.members).map(q => q.color))
        let color = 0
        while (used.has(color) && color < COLORS) color++
        p = { id, secret, name, joinedAt: now, color: color % COLORS, pid: hex(6) }
        s.members[id] = p
      } else if (name && name !== p.name && !Object.values(s.members).some(q => q.id !== id && q.name.toLowerCase() === name.toLowerCase())) {
        p.name = name
      }
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && attached(other) === id) try { other.close(4000, 'opened elsewhere') } catch { /* closed */ }
      }
      const first = !s.host && Object.keys(s.members).length === 1
      if (idOk(m.vid)) p.vid = m.vid
      p.pid ??= hex(6)
      ws.serializeAttachment({ id })
      this.sent.delete(ws)
      if (!s.host || !s.members[s.host]) s.host = id
      // Someone arriving mid-game is seated if the game takes late joiners (never in a tournament). While the rules are
      // up, anyone can still take a seat.
      const inst = s.inst
      if (inst && s.phase === 'game' && !inst.players.includes(id) && inst.players.length < META[inst.id].max) {
        const game = GAMES[inst.id]
        const tourney = inst.night && s.night?.length === 'tournament'
        if (inst.intro && !tourney) inst.players.push(id)
        else if (game.join && !tourney) this.run(g => { if (game.join!(g, inst.s, id)) inst.players.push(id) }, now)
      }
      // Back after a dropped connection, in the same game.
      const dropAt = s.drops?.[id]
      if (dropAt !== undefined) {
        delete s.drops![id]
        if (now - dropAt < REJOIN_MS && inst?.q && inst.q.dropped.includes(id) && !inst.q.back.includes(id)) inst.q.back.push(id)
      }
      const count = Object.keys(s.members).length, code = s.code
      const a = { rid: (s.rid ??= hex(8)), code, pid: p.pid!, vid: p.vid ?? '', sid: idOk(m.sid) ? m.sid : '', first }
      this.reports.push(st => st.joined(code, id, count, a))
      try { ws.send(JSON.stringify({ t: 'chat', all: this.chat })) } catch { /* closed */ }
      return this.commit()
    }

    if (!me || !s.members[me]) return err('Join first')
    const isHost = s.host === me
    const hostOnly = () => { if (!isHost) err('Only the host can do that'); return isHost }
    const bail = () => fired ? this.commit() : undefined

    switch (m.t) {
      case 'g': {
        const inst = s.inst
        if (!inst || s.phase !== 'game') { err('No game is running'); return bail() }
        if (!inst.players.includes(me)) { err('You are watching this game'); return bail() }
        if (inst.intro) { err('The game starts in a moment'); return bail() }
        if (inst.q) inst.q.acts++
        const game = GAMES[inst.id]
        const e = this.run(g => game.act(g, inst.s, me, m), now)
        if (typeof e === 'string') { err(e); if (!this.emits.length && !fired) return }
        break
      }
      case 'chat': {
        const text = clean(m.text, 200)
        if (!text) return bail()
        const c = { id: me, text, at: now }
        this.chat.push(c)
        if (this.chat.length > 80) this.chat.splice(0, this.chat.length - 80)
        if (!fired) this.isQuiet = true
        this.isLazy = true
        this.emits.push({ msg: { t: 'chat', m: c } })
        break
      }
      case 'ready': {
        const inst = s.inst
        if (!inst?.intro || s.phase !== 'game') return bail()
        if (!inst.intro.ready.includes(me)) inst.intro.ready.push(me)
        this.readyCheck(inst, now)
        break
      }
      case 'again': {
        // "I'm in" on the results screen: a vote for another game, shown to the host. Tapping again takes it back.
        const inst = s.inst
        if (!inst || s.phase !== 'results') return bail()
        const a = (inst.again ??= [])
        if (a.includes(me)) a.splice(a.indexOf(me), 1); else a.push(me)
        this.isLazy = true
        break
      }
      case 'fb': {
        // Feedback on the game just played: stars, would play again, and a line of text.
        const inst = s.inst
        if (!inst || s.phase !== 'results') return bail()
        const f = { vid: s.members[me].vid ?? '', rid: s.rid ?? '', game: inst.id, rating: Number(m.rating) || undefined, again: typeof m.again === 'boolean' ? m.again : undefined, kind: m.kind === 'idea' ? 'idea' : 'fix', text: clean(m.text, 300) }
        this.reports.push(st => st.feedback(f))
        this.isQuiet = true
        this.isLazy = true
        break
      }
      case 'pick': {
        if (!hostOnly()) return bail()
        const id = String(m.id)
        if (!GAMES[id] || s.phase === 'game') return bail()
        s.pick = id
        s.phase = 'lobby'
        break
      }
      case 'config': {
        if (!hostOnly()) return bail()
        const id = String(m.id)
        if (!GAMES[id]) return bail()
        s.configs[id] = settings(id, m.config, s.configs[id])
        break
      }
      case 'start': {
        if (!hostOnly() || s.phase === 'game') return bail()
        const id = GAMES[String(m.id)] ? String(m.id) : s.pick
        const seats = this.seatsFor(id)
        if (typeof seats === 'string') { err(seats); return bail() }
        s.pick = id
        this.start(id, settings(id, s.configs[id]), seats, now, false)
        break
      }
      case 'abort': {
        if (!hostOnly() || s.phase !== 'game' || !s.inst) return bail()
        if (s.inst.night && s.night && !s.night.done) s.night.idx--
        const a = this.endInfo(s.inst, 'aborted')
        this.reports.push(st => st.aborted(a))
        s.inst = null
        s.phase = 'lobby'
        break
      }
      case 'lobby': {
        if (!hostOnly()) return bail()
        if (s.phase === 'results') s.phase = 'lobby'
        break
      }
      case 'night': {
        if (!hostOnly() || s.phase === 'game') return bail()
        const length = (Object.keys(LENGTHS) as Length[]).includes(m.length as Length) ? (m.length as Length) : 'standard'
        const moods = (Array.isArray(m.moods) ? m.moods : []).filter((x): x is Mood => MOODS.includes(x as Mood)).slice(0, 4)
        const n = this.online().size
        const games = plan(n, length, moods, this.r.rand)
        if (!games.length) { err('No games fit this many players'); return bail() }
        s.night = { length, moods, plan: games, idx: -1, alive: [], points: {}, rounds: [], done: false, champions: [] }
        s.phase = 'lobby'
        break
      }
      case 'nightSwap': {
        if (!hostOnly()) return bail()
        const n = s.night
        const i = Number(m.i)
        if (!n || n.done || !(i > n.idx && i < n.plan.length)) return bail()
        const alt = swap(n, i, n.length === 'tournament' && n.idx >= 0 ? n.alive.length : this.online().size, this.r.rand)
        if (!alt) { err('No other game fits'); return bail() }
        n.plan[i] = alt
        break
      }
      case 'nightDrop': {
        if (!hostOnly()) return bail()
        const n = s.night
        const i = Number(m.i)
        if (!n || n.done || n.length === 'tournament' || !(i > n.idx && i < n.plan.length) || n.plan.length < 2) return bail()
        n.plan.splice(i, 1)
        break
      }
      case 'nightGo': {
        if (!hostOnly()) return bail()
        const n = s.night
        if (!n || n.done || s.phase === 'game') return bail()
        if (n.idx === -1) {
          const online = this.online()
          n.alive = Object.values(s.members).filter(x => online.has(x.id)).map(x => x.id)
          if (n.length === 'tournament' && n.alive.length < 2) { err('A tournament needs at least 2 players'); return bail() }
        }
        const e = this.nightNext(now)
        if (e) { err(e); return bail() }
        break
      }
      case 'nightEnd': {
        if (!hostOnly() || s.phase === 'game') return bail()
        s.night = null
        s.phase = 'lobby'
        break
      }
      case 'host': {
        const to = String(m.id ?? '')
        if (!isHost || !s.members[to]) return bail()
        s.host = to
        break
      }
      case 'kick': {
        const to = String(m.id ?? '')
        if (!isHost || to === me || !s.members[to]) return bail()
        delete s.members[to]
        for (const w of this.ctx.getWebSockets()) if (attached(w) === to) try { w.close(4001, 'removed by host') } catch { /* closed */ }
        const inst = s.inst
        if (inst && s.phase === 'game' && inst.players.includes(to)) {
          if (inst.intro) { inst.players = inst.players.filter(x => x !== to); this.readyCheck(inst, now) }
          else {
            const game = GAMES[inst.id]
            this.run(g => game.leave?.(g, inst.s, to), now)
          }
        }
        break
      }
      default:
        return bail()
    }
    await this.commit()
  }

  async alarm() {
    const s = this.s
    if (!s) return
    const now = Date.now()
    if (now - s.touched > KEEP_MS && this.ctx.getWebSockets().length === 0) {
      this.s = null
      await this.ctx.storage.deleteAll()
      return
    }
    this.reset()
    if (s.inst?.intro && now >= s.inst.wake) await this.readDecks()
    if (this.due(now)) return this.commit()
    if (this.dirty) await this.save()
    await this.schedule()
  }

  async webSocketClose(ws: WebSocket, code: number) { await this.left(ws, code) }
  async webSocketError(ws: WebSocket) { await this.left(ws, 1006) }

  async left(ws: WebSocket, code: number) {
    const s = this.s
    if (!s) return
    const id = attached(ws)
    const online = this.online(ws)
    const now = Date.now()
    const inst = s.phase === 'game' ? s.inst : null
    // A seated player whose line dropped mid-game (not one who left on purpose).
    if (id && inst?.q && inst.players.includes(id) && !online.has(id) && !CHOSEN_CLOSE.has(code)) {
      s.drops ??= {}
      for (const [k, at] of Object.entries(s.drops)) if (now - at > REJOIN_MS) delete s.drops[k]
      s.drops[id] = now
      if (!inst.q.dropped.includes(id)) inst.q.dropped.push(id)
    }
    if (id && id === s.host && !online.has(id)) {
      const next = Object.values(s.members).filter(q => online.has(q.id)).sort((a, b) => a.joinedAt - b.joinedAt)[0]
      if (next) s.host = next.id
    }
    this.reset()
    this.isLazy = true
    // Whoever is still here may all have closed the rules already.
    if (inst?.intro) {
      await this.readDecks()
      this.readyCheck(inst, Date.now(), ws)
      if (!inst.intro) this.isLazy = false
    }
    await this.commit()
  }

  online(except?: WebSocket) {
    const ids = new Set<string>()
    for (const w of this.ctx.getWebSockets()) {
      if (w === except || w.readyState !== WebSocket.OPEN) continue
      const id = attached(w)
      if (id) ids.add(id)
    }
    return ids
  }

  // ---------- saving and sending ----------

  async save() {
    if (!this.s) return
    const puts: Record<string, unknown> = { s: this.s, chat: this.chat }
    const dels: string[] = []
    for (const k of this.dirtyBlobs) {
      if (this.blobs.has(k)) puts['b:' + k] = this.blobs.get(k)
      else dels.push('b:' + k)
    }
    this.dirtyBlobs.clear()
    await this.ctx.storage.put(puts)
    if (dels.length) await this.ctx.storage.delete(dels)
    this.dirty = false
    this.lastSave = Date.now()
  }

  async commit() {
    const now = Date.now()
    // Pen strokes and chat lines arrive many times a second; they are written at most every few seconds.
    if (this.isLazy && now - this.lastSave < LAZY_MS) this.dirty = true
    else await this.save()
    await this.schedule()
    if (!this.isQuiet) this.broadcast()
    this.sendEmits()
    await this.flush()
  }

  sendEmits() {
    if (!this.emits.length) return
    const socks = this.ctx.getWebSockets()
    for (const { msg, to } of this.emits) {
      const wire = JSON.stringify((msg as { t?: string }).t === 'chat' ? msg : { t: 'ev', ev: msg })
      const targets = to === undefined ? null : new Set(Array.isArray(to) ? to : [to])
      for (const ws of socks) {
        const id = attached(ws)
        if (!id || (targets && !targets.has(id))) continue
        try { ws.send(wire) } catch { /* closing */ }
      }
    }
    this.emits = []
  }

  /** The site's place in each content pool, so a new game carries on from where every other room got to. */
  async readDecks() {
    const stats = this.env.STATS.get(this.env.STATS.idFromName('global'))
    const late = new Promise<null>(r => setTimeout(() => r(null), 1500))
    const got = await Promise.race([stats.decks().catch(() => null), late])
    if (got) this.site = got
  }

  async flush() {
    const s = this.s
    if (s?.rid) {
      const vids = [...this.online()].map(id => s.members[id]?.vid || id).sort()
      const key = `${s.phase} ${vids.join(',')}`
      if (key !== this.lastPresence) {
        this.lastPresence = key
        const p = { rid: s.rid, phase: s.phase, vids }
        this.reports.push(st => st.presence(p))
      }
    }
    if (Object.keys(this.moved).length) {
      const moved = this.moved
      this.moved = {}
      this.reports.push(st => st.dealt(moved))
    }
    if (!this.reports.length) return
    const stats = this.env.STATS.get(this.env.STATS.idFromName('global'))
    const todo = this.reports.splice(0)
    // Counting must never get in the way of a game.
    for (const report of todo) await report(stats).catch(() => {})
  }

  async schedule() {
    const s = this.s
    if (!s) return
    let at = s.touched + KEEP_MS + 60_000
    if (s.phase === 'game' && s.inst?.wake) at = Math.min(at, s.inst.wake)
    if (this.dirty) at = Math.min(at, this.lastSave + LAZY_MS)
    await this.ctx.storage.setAlarm(at)
  }

  broadcast() {
    const s = this.s
    if (!s) return
    const now = Date.now()
    const online = this.online()
    const inst = s.inst
    const room = {
      code: s.code, host: s.host, phase: s.phase, pick: s.pick, configs: s.configs, history: s.history.slice(0, 10),
      members: Object.values(s.members).sort((a, b) => a.joinedAt - b.joinedAt).map(m => ({
        id: m.id, name: m.name, color: m.color, online: online.has(m.id), ...(s.totals[m.id] ?? { pts: 0, wins: 0, games: 0 }),
      })),
      inst: inst && {
        id: inst.id, n: inst.n, config: inst.config, players: inst.players, startedAt: inst.startedAt, endedAt: inst.endedAt, standings: inst.standings,
        summary: inst.summary, night: inst.night, again: inst.again ?? [], intro: inst.intro ? { until: inst.intro.until, ready: inst.intro.ready } : null,
      },
      night: s.night,
    }
    const game = inst ? GAMES[inst.id] : null
    const ctx = inst ? this.ctxFor(inst, now) : null
    for (const ws of this.ctx.getWebSockets()) {
      const id = attached(ws)
      if (!id || !s.members[id]) continue
      const base = JSON.stringify({ t: 's', now, you: id, room })
      let wire = base
      if (inst && game && ctx && !inst.intro) {
        let v: string
        try { v = JSON.stringify({ n: inst.n, v: game.view(ctx, inst.s, id) }) } catch (e) { console.error('view', inst.id, e); v = JSON.stringify({ n: inst.n, v: null }) }
        // Only send the game view when it changed for this player.
        if (this.sent.get(ws) !== v) { this.sent.set(ws, v); wire = base.slice(0, -1) + ',"game":' + v + '}' }
      }
      try { ws.send(wire) } catch { /* closing */ }
    }
  }
}
