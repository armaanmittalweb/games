import { DurableObject } from 'cloudflare:workers'
import { VALID, pickWords, score } from './words'

export type Mode = 'marathon' | 'race' | 'survival' | 'blitz'

export interface Config {
  mode: Mode
  words: number // how many words in the pool (blitz: how many rounds)
  minutes: number // whole-game timer (not used by blitz)
  roundSeconds: number // blitz only
}

interface Result {
  solved: boolean
  tries: number
  at: number // ms from the start of the game (blitz: from the start of the round)
  pts: number
  place?: number // blitz: 1 = first to solve the round
}

interface Player {
  id: string
  secret: string
  name: string
  joinedAt: number
  idx: number // the word this player is on
  guesses: string[]
  marks: number[][]
  results: Result[] // by word index
  points: number
  solved: number
  tries: number // guesses spent on solved words
  lastSolveAt: number // ms from the start when the latest word was solved
  firsts: number // blitz: rounds this player solved first
  solveMs: number // blitz: summed time to solve
  out: boolean // survival: missed a word
  finishedAt: number | null
}

interface State {
  code: string
  host: string | null
  phase: 'lobby' | 'playing' | 'reveal' | 'done'
  config: Config
  words: string[]
  game: number
  startedAt: number
  endsAt: number
  round: number
  roundStartedAt: number
  roundEndsAt: number
  revealUntil: number
  endedAt: number
  touched: number
  players: Record<string, Player>
}

const DEFAULTS: Config = { mode: 'marathon', words: 15, minutes: 10, roundSeconds: 90 }
const MAX_PLAYERS = 30
const COUNTDOWN_MS = 3000
const REVEAL_MS = 5000
const KEEP_MS = 24 * 3600_000
const BLITZ_BONUS = [3, 2, 1]

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

function fresh(p: Player) {
  Object.assign(p, { idx: 0, guesses: [], marks: [], results: [], points: 0, solved: 0, tries: 0, lastSolveAt: 0, firsts: 0, solveMs: 0, out: false, finishedAt: null })
}

/** Sort key per mode; lower sorts first. Players with equal keys share a place. */
function key(p: Player, mode: Mode): number[] {
  switch (mode) {
    case 'marathon': return [-p.points, -p.solved, p.tries, p.lastSolveAt]
    case 'race': return [-p.solved, p.lastSolveAt, p.tries]
    case 'survival': return [-p.solved, p.tries, p.lastSolveAt]
    case 'blitz': return [-p.points, -p.firsts, p.solveMs, p.tries]
  }
}

function cmp(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

export class Room extends DurableObject {
  s: State | null = null

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    ctx.blockConcurrencyWhile(async () => { this.s = (await ctx.storage.get<State>('s')) ?? null })
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/init') {
      if (this.s) return new Response('taken', { status: 409 })
      const now = Date.now()
      this.s = {
        code: url.searchParams.get('code') ?? '', host: null, phase: 'lobby', config: { ...DEFAULTS }, words: [], game: 0,
        startedAt: 0, endsAt: 0, round: 0, roundStartedAt: 0, roundEndsAt: 0, revealUntil: 0, endedAt: 0, touched: now, players: {},
      }
      await this.save()
      return new Response('ok')
    }
    if (!this.s) return new Response('no such room', { status: 404 })
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const s = this.s
    if (!s || typeof raw !== 'string' || raw.length > 2000) return
    let m: Record<string, unknown>
    try { m = JSON.parse(raw) } catch { return }
    const now = Date.now()
    s.touched = now
    const me = (ws.deserializeAttachment() as { id?: string } | null)?.id
    const err = (msg: string) => ws.send(JSON.stringify({ t: 'error', msg }))

    if (m.t === 'join') {
      const id = String(m.id ?? '').slice(0, 40), secret = String(m.secret ?? '').slice(0, 80)
      let name = String(m.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16)
      if (!id || !secret) return err('Missing player id')
      let p = s.players[id]
      if (p && p.secret !== secret) return err('That player id is taken')
      if (!p) {
        if (!name) return err('Pick a name')
        if (Object.keys(s.players).length >= MAX_PLAYERS) return err(`Room is full (${MAX_PLAYERS} players)`)
        const taken = new Set(Object.values(s.players).map(q => q.name.toLowerCase()))
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${name.slice(0, 13)} ${n}`
        p = { id, secret, name, joinedAt: now } as Player
        fresh(p)
        if (s.config.mode === 'blitz' && s.phase !== 'lobby') p.idx = s.round
        s.players[id] = p
      } else if (name && name !== p.name) {
        p.name = name
      }
      // One live socket per player: close the older tab.
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && (other.deserializeAttachment() as { id?: string } | null)?.id === id) {
          try { other.close(4000, 'opened elsewhere') } catch { /* already closed */ }
        }
      }
      ws.serializeAttachment({ id })
      if (!s.host || !s.players[s.host]) s.host = id
      return this.commit()
    }

    if (!me || !s.players[me]) return err('Join first')
    const p = s.players[me]
    const isHost = s.host === me

    switch (m.t) {
      case 'config': {
        if (!isHost) return err('Only the host can change settings')
        if (s.phase !== 'lobby' && s.phase !== 'done') return
        const c = (m.config ?? {}) as Partial<Config>
        s.config = {
          mode: (['marathon', 'race', 'survival', 'blitz'] as Mode[]).includes(c.mode as Mode) ? (c.mode as Mode) : s.config.mode,
          words: clamp(c.words, 1, 50, s.config.words),
          minutes: clamp(c.minutes, 1, 60, s.config.minutes),
          roundSeconds: clamp(c.roundSeconds, 20, 300, s.config.roundSeconds),
        }
        return this.commit()
      }
      case 'start': {
        if (!isHost) return err('Only the host can start')
        if (s.phase === 'playing' || s.phase === 'reveal') return
        const c = s.config
        s.words = pickWords(c.words)
        s.game++
        s.phase = 'playing'
        s.startedAt = now + COUNTDOWN_MS
        s.endsAt = c.mode === 'blitz' ? 0 : s.startedAt + c.minutes * 60_000
        s.round = 0
        s.roundStartedAt = s.startedAt
        s.roundEndsAt = c.mode === 'blitz' ? s.startedAt + c.roundSeconds * 1000 : 0
        s.endedAt = 0
        for (const q of Object.values(s.players)) fresh(q)
        return this.commit()
      }
      case 'end': {
        if (!isHost) return err('Only the host can end the game')
        if (s.phase === 'playing' || s.phase === 'reveal') this.finish(now)
        return this.commit()
      }
      case 'lobby': {
        if (!isHost) return err('Only the host can do that')
        if (s.phase !== 'done') return
        s.phase = 'lobby'
        for (const q of Object.values(s.players)) fresh(q)
        return this.commit()
      }
      case 'host': {
        const to = String(m.id ?? '')
        if (!isHost || !s.players[to]) return
        s.host = to
        return this.commit()
      }
      case 'kick': {
        const to = String(m.id ?? '')
        if (!isHost || to === me || !s.players[to]) return
        delete s.players[to]
        for (const w of this.ctx.getWebSockets()) {
          if ((w.deserializeAttachment() as { id?: string } | null)?.id === to) try { w.close(4001, 'removed by host') } catch { /* closed */ }
        }
        this.settle(now)
        return this.commit()
      }
      case 'guess':
      case 'skip': {
        if (s.phase !== 'playing') return err(s.phase === 'reveal' ? 'Next word is coming' : 'The game is not running')
        if (now < s.startedAt) return err('Wait for the countdown')
        if (this.expired(now)) { this.tick(now); return this.commit() }
        if (p.out || p.finishedAt !== null) return err('You are done. Wait for the others')
        const blitz = s.config.mode === 'blitz'
        if (blitz && p.results[s.round]) return err('You are done with this word')
        const answer = s.words[p.idx]
        const since = blitz ? s.roundStartedAt : s.startedAt
        if (m.t === 'skip') {
          if (blitz) return err('No skipping in blitz')
          this.close(p, false, now - since, now)
        } else {
          const g = String(m.word ?? '').toLowerCase()
          if (!/^[a-z]{5}$/.test(g)) return ws.send(JSON.stringify({ t: 'bad', msg: 'Five letters' }))
          if (!VALID.has(g)) return ws.send(JSON.stringify({ t: 'bad', msg: 'Not a real English word' }))
          const marks = score(g, answer)
          p.guesses.push(g)
          p.marks.push(marks)
          if (g === answer) this.close(p, true, now - since, now)
          else if (p.guesses.length >= 6) this.close(p, false, now - since, now)
        }
        this.settle(now)
        return this.commit()
      }
    }
  }

  /** Finishes the player's current word. */
  close(p: Player, solved: boolean, at: number, now: number) {
    const s = this.s!
    const tries = p.guesses.length
    const r: Result = { solved, tries, at, pts: 0 }
    if (solved) {
      r.pts = 7 - tries
      if (s.config.mode === 'blitz') {
        const place = Object.values(s.players).filter(q => q.results[s.round]?.solved).length + 1
        r.place = place
        r.pts += BLITZ_BONUS[place - 1] ?? 0
        if (place === 1) p.firsts++
        p.solveMs += at
      }
      p.points += r.pts
      p.solved++
      p.tries += tries
      p.lastSolveAt = s.config.mode === 'blitz' ? p.lastSolveAt : at
    } else if (s.config.mode === 'survival') {
      p.out = true
    }
    if (s.config.mode === 'blitz') {
      p.results[s.round] = r
    } else {
      p.results[p.idx] = r
      p.idx++
      p.guesses = []
      p.marks = []
      if (p.out || p.idx >= s.words.length) p.finishedAt = now
    }
  }

  expired(now: number) {
    const s = this.s!
    return s.config.mode === 'blitz' ? now >= s.roundEndsAt : now >= s.endsAt
  }

  /** Moves the game on when everyone is done with the word (blitz) or with the game. */
  settle(now: number) {
    const s = this.s!
    if (s.phase !== 'playing') return
    const players = Object.values(s.players)
    if (s.config.mode === 'blitz') {
      const online = this.online()
      const waiting = players.filter(q => !q.results[s.round] && (online.has(q.id) || q.guesses.length))
      if (waiting.length === 0 && players.length) this.endRound(now)
    } else if (players.length && players.every(q => q.finishedAt !== null)) {
      this.finish(now)
    }
  }

  endRound(now: number) {
    const s = this.s!
    for (const q of Object.values(s.players)) {
      if (!q.results[s.round]) q.results[s.round] = { solved: false, tries: q.guesses.length, at: s.roundEndsAt - s.roundStartedAt, pts: 0 }
    }
    s.phase = 'reveal'
    s.revealUntil = now + REVEAL_MS
  }

  finish(now: number) {
    const s = this.s!
    if (s.config.mode === 'blitz' && s.phase === 'playing') {
      for (const q of Object.values(s.players)) if (!q.results[s.round]) q.results[s.round] = { solved: false, tries: q.guesses.length, at: now - s.roundStartedAt, pts: 0 }
    }
    if (s.config.mode !== 'blitz') {
      for (const q of Object.values(s.players)) {
        if (q.finishedAt === null && q.guesses.length && q.idx < s.words.length) q.results[q.idx] = { solved: false, tries: q.guesses.length, at: now - s.startedAt, pts: 0 }
      }
    }
    s.phase = 'done'
    s.endedAt = now
  }

  /** Applies whatever time has made due. */
  tick(now: number) {
    const s = this.s!
    if (s.phase === 'playing') {
      if (s.config.mode === 'blitz' && now >= s.roundEndsAt) this.endRound(now)
      else if (s.config.mode !== 'blitz' && now >= s.endsAt) this.finish(now)
    }
    if (s.phase === 'reveal' && now >= s.revealUntil) {
      if (s.round + 1 >= s.words.length) return this.finish(now)
      s.round++
      s.phase = 'playing'
      s.roundStartedAt = now
      s.roundEndsAt = now + s.config.roundSeconds * 1000
      for (const q of Object.values(s.players)) { q.idx = s.round; q.guesses = []; q.marks = [] }
    }
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
    this.tick(now)
    await this.commit()
  }

  async webSocketClose(ws: WebSocket) { await this.left(ws) }
  async webSocketError(ws: WebSocket) { await this.left(ws) }

  async left(ws: WebSocket) {
    const s = this.s
    if (!s) return
    const id = (ws.deserializeAttachment() as { id?: string } | null)?.id
    const online = this.online(ws)
    // Hand the room to someone who is still here.
    if (id && id === s.host && !online.has(id)) {
      const next = Object.values(s.players).filter(q => online.has(q.id)).sort((a, b) => a.joinedAt - b.joinedAt)[0]
      if (next) s.host = next.id
    }
    this.settle(Date.now())
    await this.commit()
  }

  online(except?: WebSocket) {
    const ids = new Set<string>()
    for (const w of this.ctx.getWebSockets()) {
      if (w === except || w.readyState !== WebSocket.OPEN) continue
      const id = (w.deserializeAttachment() as { id?: string } | null)?.id
      if (id) ids.add(id)
    }
    return ids
  }

  async save() { if (this.s) await this.ctx.storage.put('s', this.s) }

  async commit() {
    await this.save()
    await this.schedule()
    this.broadcast()
  }

  async schedule() {
    const s = this.s
    if (!s) return
    let at = s.touched + KEEP_MS + 60_000
    if (s.phase === 'playing') at = s.config.mode === 'blitz' ? s.roundEndsAt : s.endsAt
    if (s.phase === 'reveal') at = s.revealUntil
    await this.ctx.storage.setAlarm(at)
  }

  broadcast() {
    const s = this.s
    if (!s) return
    const now = Date.now()
    const online = this.online()
    const mode = s.config.mode
    const ranked = Object.values(s.players).sort((a, b) => cmp(key(a, mode), key(b, mode)) || a.joinedAt - b.joinedAt)
    const places: number[] = []
    ranked.forEach((p, i) => { places[i] = i > 0 && cmp(key(p, mode), key(ranked[i - 1], mode)) === 0 ? places[i - 1] : i + 1 })
    const done = s.phase === 'done'
    const players = ranked.map((p, i) => ({
      id: p.id, name: p.name, online: online.has(p.id), place: places[i],
      idx: p.idx, solved: p.solved, points: p.points, tries: p.tries, lastSolveAt: p.lastSolveAt, firsts: p.firsts, solveMs: p.solveMs,
      out: p.out, finished: p.finishedAt !== null, marks: p.marks,
      results: (done || mode === 'blitz') ? p.results.map(r => r && { solved: r.solved, tries: r.tries, at: r.at, pts: r.pts, place: r.place }) : p.results.map(r => r && { solved: r.solved, tries: r.tries }),
    }))
    const base = {
      t: 'state', now, code: s.code, host: s.host, phase: s.phase, config: s.config, game: s.game, total: s.words.length,
      startedAt: s.startedAt, endsAt: s.endsAt, round: s.round, roundStartedAt: s.roundStartedAt, roundEndsAt: s.roundEndsAt, revealUntil: s.revealUntil,
      endedAt: s.endedAt, players,
      words: done ? s.words : undefined,
      reveal: s.phase === 'reveal' ? s.words[s.round] : undefined,
    }
    for (const ws of this.ctx.getWebSockets()) {
      const id = (ws.deserializeAttachment() as { id?: string } | null)?.id
      if (!id || !s.players[id]) continue
      const p = s.players[id]
      // Only words this player is finished with are sent to them.
      const seen = s.words.map((w, i) => (done || (mode === 'blitz' ? (i < s.round || p.results[i] || (i === s.round && s.phase === 'reveal')) : i < p.idx)) ? w : null)
      try {
        ws.send(JSON.stringify({ ...base, you: id, me: { idx: p.idx, guesses: p.guesses, marks: p.marks, words: seen } }))
      } catch { /* closing */ }
    }
  }
}
