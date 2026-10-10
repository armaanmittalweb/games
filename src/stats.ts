import { DurableObject } from 'cloudflare:workers'
import * as A from './analytics'

/**
 * Site-wide counts for the Switchboard. One instance ("global"); every room reports to it when it is made, when
 * someone joins and when a game starts or ends. Player ids are the random ids browsers make for themselves.
 */
const DAY = 86_400_000
const KEEP = 30 * DAY

export class Stats extends DurableObject {
  sql: SqlStorage

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, created INTEGER, last INTEGER, phase TEXT, players INTEGER DEFAULT 0, games INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, first INTEGER, last INTEGER);
      CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, rooms INTEGER DEFAULT 0, games INTEGER DEFAULT 0, finished INTEGER DEFAULT 0,
        seats INTEGER DEFAULT 0, guesses INTEGER DEFAULT 0, solved INTEGER DEFAULT 0, newPlayers INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS modes (mode TEXT PRIMARY KEY, games INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS decks (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
    `)
    this.sql.exec(A.SCHEMA)
  }

  private day(field: string, n = 1) {
    const d = new Date().toISOString().slice(0, 10)
    this.sql.exec(`INSERT INTO days (day, ${field}) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET ${field} = ${field} + excluded.${field}`, d, n)
  }

  async roomCreated(code: string, rid?: string) {
    const now = Date.now()
    if (rid) A.roomMade(this.sql, rid, code, now)
    this.sql.exec('INSERT OR IGNORE INTO rooms (code, created, last, phase) VALUES (?, ?, ?, ?)', code, now, now, 'lobby')
    this.day('rooms')
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + DAY)
  }

  async joined(code: string, player: string, players: number, a?: A.RoomJoin) {
    const now = Date.now()
    if (a) A.joined(this.sql, a, now)
    const isNew = this.sql.exec('SELECT 1 FROM players WHERE id = ?', player).toArray().length === 0
    this.sql.exec('INSERT INTO players (id, first, last) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET last = excluded.last', player, now, now)
    if (isNew) this.day('newPlayers')
    this.sql.exec('UPDATE rooms SET last = ?, players = ? WHERE code = ?', now, players, code)
  }

  async started(code: string, mode: string, players: number, a?: A.GameStart) {
    if (a) A.gameChosen(this.sql, a)
    this.sql.exec("UPDATE rooms SET last = ?, phase = 'playing', games = games + 1, players = ? WHERE code = ?", Date.now(), players, code)
    this.sql.exec('INSERT INTO modes (mode, games) VALUES (?, 1) ON CONFLICT(mode) DO UPDATE SET games = games + 1', mode)
    this.day('games')
    this.day('seats', players)
  }

  async finished(code: string, guesses: number, solved: number, a?: A.GameEnd) {
    if (a) A.gameEnded(this.sql, a)
    this.sql.exec("UPDATE rooms SET last = ?, phase = 'done' WHERE code = ?", Date.now(), code)
    this.day('finished')
    this.day('guesses', guesses)
    this.day('solved', solved)
  }

  /** A game the host ended before it finished. */
  async aborted(a: A.GameEnd) { A.gameEnded(this.sql, a) }

  async presence(p: A.Presence) { A.presence(this.sql, p) }

  async feedback(f: A.Feedback) { A.feedback(this.sql, f) }

  /** Page views, share taps and script errors, sent by the page to /api/ev. */
  async event(e: A.PageEvent) { A.pageEvent(this.sql, e) }

  /** The Switchboard's Game Night page. */
  async analytics(days: number) { return A.reportJson(this.sql, days) }

  /** How far the site has dealt into each content pool (questions, prompts, words), so no room repeats an item early. */
  async decks(): Promise<Record<string, number>> {
    return Object.fromEntries(this.sql.exec('SELECT key, at FROM decks').toArray().map(r => [r.key as string, r.at as number]))
  }

  async dealt(moved: Record<string, number>) {
    for (const [key, at] of Object.entries(moved)) {
      if (typeof at !== 'number' || !Number.isFinite(at) || key.length > 80) continue
      this.sql.exec('INSERT INTO decks (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = MAX(at, excluded.at)', key, Math.floor(at))
    }
  }

  async alarm() {
    const old = Date.now() - KEEP
    this.sql.exec('DELETE FROM rooms WHERE last < ?', old)
    this.sql.exec('DELETE FROM players WHERE last < ?', old)
    // Messages from the contact page can hold a way to reply: kept for 30 days (see public/contact.html).
    this.sql.exec("DELETE FROM a_feedback WHERE kind = 'report' AND at < ?", Date.now() - 30 * DAY)
    await this.ctx.storage.setAlarm(Date.now() + DAY)
  }

  async report() {
    const now = Date.now()
    const one = <T>(q: string, ...b: unknown[]) => this.sql.exec(q, ...b).one() as T
    const today = new Date(now).toISOString().slice(0, 10)
    const t = (this.sql.exec('SELECT * FROM days WHERE day = ?', today).toArray()[0] ?? {}) as Record<string, number>
    const all = one<Record<string, number>>('SELECT COALESCE(SUM(rooms),0) rooms, COALESCE(SUM(games),0) games, COALESCE(SUM(finished),0) finished, COALESCE(SUM(seats),0) seats, COALESCE(SUM(guesses),0) guesses FROM days')
    const modes = Object.fromEntries(this.sql.exec('SELECT mode, games FROM modes').toArray().map(r => [r.mode as string, r.games as number]))
    return {
      dbBytes: this.sql.databaseSize,
      roomsTotal: all.rooms,
      gamesTotal: all.games,
      finishedTotal: all.finished,
      guessesTotal: all.guesses,
      avgPlayers: all.games ? Math.round((all.seats / all.games) * 10) / 10 : 0,
      rooms24h: one<{ n: number }>('SELECT COUNT(*) n FROM rooms WHERE last > ?', now - DAY).n,
      // Every game ends on its own timer (and reports it), so a room still marked playing is mid-game. The time limit
      // only guards against a report that never arrived: the longest game, 50 blitz rounds of 5 minutes, is 4 h 10 min.
      liveRooms: one<{ n: number }>("SELECT COUNT(*) n FROM rooms WHERE phase = 'playing' AND last > ?", now - 5 * 3_600_000).n,
      players24h: one<{ n: number }>('SELECT COUNT(*) n FROM players WHERE last > ?', now - DAY).n,
      players30d: one<{ n: number }>('SELECT COUNT(*) n FROM players').n,
      today: { rooms: t.rooms ?? 0, games: t.games ?? 0, finished: t.finished ?? 0, guesses: t.guesses ?? 0, solved: t.solved ?? 0, newPlayers: t.newPlayers ?? 0 },
      modes,
    }
  }
}
