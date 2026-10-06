// Product analytics for the Switchboard's Game Night page. Kept in the Stats object's SQLite next to the older counts.
//
// Nobody is identified. The ids are random strings the browser and the room make for themselves:
//   visitor (vid)  one browser, kept in localStorage           session (sid)  one visit, ends after 30 idle minutes
//   room (rid)     one room, i.e. one game night               player (pid)   a player inside one room only
// Browsers driven by test tools, and any browser opened once with /?me=1, are marked x = 1 and left out of every number.
// Days are Indian days (UTC+5:30): most players are in India and a night's games should land on one day.

import { CATALOG } from './catalog'

const IST = 5.5 * 3_600_000
const DAY = 86_400_000
export const dayOf = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10)
const dayMs = (day: string) => Date.parse(day + 'T00:00:00Z') - IST
const addDays = (day: string, n: number) => dayOf(dayMs(day) + n * DAY + 3_600_000)

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS a_visitors (vid TEXT PRIMARY KEY, first INTEGER, day TEXT, src TEXT, ref TEXT, landing TEXT, invite INTEGER DEFAULT 0,
    country TEXT, device TEXT, x INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS a_sessions (sid TEXT PRIMARY KEY, vid TEXT, start INTEGER, last INTEGER, day TEXT, src TEXT, landing TEXT,
    views INTEGER DEFAULT 0, joined INTEGER DEFAULT 0, err INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS a_active (vid TEXT, day TEXT, played INTEGER DEFAULT 0, PRIMARY KEY (vid, day));
  CREATE TABLE IF NOT EXISTS a_rooms (rid TEXT PRIMARY KEY, code TEXT, created INTEGER, day TEXT, creator TEXT, games INTEGER DEFAULT 0,
    done INTEGER DEFAULT 0, first INTEGER, last INTEGER, night INTEGER DEFAULT 0, x INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS a_players (rid TEXT, pid TEXT, vid TEXT, joined INTEGER, PRIMARY KEY (rid, pid));
  CREATE TABLE IF NOT EXISTS a_games (gid TEXT PRIMARY KEY, rid TEXT, game TEXT, seq INTEGER, players INTEGER, chosen INTEGER, began INTEGER,
    ended INTEGER, outcome TEXT, night INTEGER, readyAll INTEGER, acts INTEGER, errs INTEGER, dropped INTEGER, rejoined INTEGER, x INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS a_counts (day TEXT, kind TEXT, key TEXT, n INTEGER, PRIMARY KEY (day, kind, key));
  CREATE TABLE IF NOT EXISTS a_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, vid TEXT, rid TEXT, game TEXT, rating INTEGER,
    again INTEGER, kind TEXT, text TEXT, x INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS a_live (rid TEXT PRIMARY KEY, phase TEXT, vids TEXT, at INTEGER);
  CREATE INDEX IF NOT EXISTS a_games_rid ON a_games (rid);
  CREATE INDEX IF NOT EXISTS a_sessions_vid ON a_sessions (vid);
`

// ---------- where people come from ----------

const SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'], [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)yandex\./, 'Yandex'], [/whatsapp|^wa\.me$/, 'WhatsApp'], [/instagram\.com$/, 'Instagram'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/^(t\.co|x\.com|twitter\.com)$/, 'X'], [/reddit\.com$/, 'Reddit'], [/(linkedin\.com|lnkd\.in)$/, 'LinkedIn'], [/(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/discord(app)?\.(com|gg)$/, 'Discord'], [/^(t\.me|telegram\.org|web\.telegram\.org)$/, 'Telegram'], [/(^|\.)amittal\.dev$/, 'amittal.dev'],
  [/chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google/, 'AI assistants'],
]

/** A referrer (or utm_source) as a named channel. */
export function channel(ref: string, utm: string): { src: string; host: string } {
  if (utm) return { src: utm.slice(0, 30).toLowerCase(), host: '' }
  if (!ref) return { src: 'Direct', host: '' }
  let host = ''
  try { host = ref.startsWith('android-app://') ? ref.slice(14).split('/')[0] : new URL(ref).hostname.replace(/^www\./, '') } catch { return { src: 'Direct', host: '' } }
  if (host === 'games.amittal.dev' || host === 'localhost') return { src: 'Direct', host: '' }
  if (/com\.whatsapp/.test(host)) return { src: 'WhatsApp', host }
  for (const [re, name] of SOURCES) if (re.test(host)) return { src: name, host }
  return { src: host.slice(0, 60), host }
}

// ---------- writing ----------

type Sql = SqlStorage
const idOk = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{6,40}$/i.test(s)
const short = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '')
const isX = (sql: Sql, vid: string) => (sql.exec('SELECT x FROM a_visitors WHERE vid = ?', vid).toArray()[0]?.x as number | undefined) ?? 0

export function count(sql: Sql, kind: string, key: string, n = 1, at = Date.now()) {
  sql.exec('INSERT INTO a_counts (day, kind, key, n) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET n = n + excluded.n', dayOf(at), kind, key.slice(0, 120), n)
}

export interface PageEvent { t: string; vid: string; sid: string; path?: string; ref?: string; utm?: string; x?: boolean; method?: string; msg?: string; country?: string; device?: string }

/** Events the page sends to /api/ev: a page view, a tap on share, a script error. */
export function pageEvent(sql: Sql, e: PageEvent, now = Date.now()) {
  if (!idOk(e.vid) || !idOk(e.sid)) return
  const day = dayOf(now)
  const x = e.x ? 1 : 0
  if (e.t === 'view') {
    const path = short(e.path, 80)
    const { src, host } = channel(short(e.ref, 300), short(e.utm, 30))
    const invite = path.startsWith('/r/') ? 1 : 0
    sql.exec(`INSERT INTO a_visitors (vid, first, day, src, ref, landing, invite, country, device, x) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(vid) DO UPDATE SET x = MAX(x, excluded.x)`, e.vid, now, day, src, host, path, invite, short(e.country, 2), short(e.device, 10), x)
    const known = sql.exec('SELECT 1 FROM a_sessions WHERE sid = ?', e.sid).toArray().length > 0
    if (known) sql.exec('UPDATE a_sessions SET last = ?, views = views + 1 WHERE sid = ?', now, e.sid)
    else sql.exec('INSERT INTO a_sessions (sid, vid, start, last, day, src, landing, views) VALUES (?, ?, ?, ?, ?, ?, ?, 1)', e.sid, e.vid, now, now, day, invite ? 'Room link' : src, path)
    sql.exec('INSERT OR IGNORE INTO a_active (vid, day) VALUES (?, ?)', e.vid, day)
  } else if (e.t === 'share') {
    if (!isX(sql, e.vid) && !x) count(sql, 'share', e.method === 'native' ? 'native' : 'copy', 1, now)
  } else if (e.t === 'err') {
    sql.exec('UPDATE a_sessions SET err = 1 WHERE sid = ?', e.sid)
    if (!isX(sql, e.vid) && !x) count(sql, 'err', short(e.msg, 120) || 'unknown', 1, now)
  }
}

export interface RoomJoin { rid: string; code: string; pid: string; vid: string; sid: string; first: boolean }

/** Someone took a seat in a room (or came back to it). */
export function joined(sql: Sql, j: RoomJoin, now = Date.now()) {
  if (!idOk(j.rid) || !idOk(j.pid)) return
  const vid = idOk(j.vid) ? j.vid : ''
  if (vid) {
    // A browser whose page view never arrived (blocked, or an old tab) still counts from here.
    sql.exec('INSERT OR IGNORE INTO a_visitors (vid, first, day, src, landing) VALUES (?, ?, ?, ?, ?)', vid, now, dayOf(now), 'Unknown', '/r/')
    sql.exec('INSERT INTO a_active (vid, day, played) VALUES (?, ?, 1) ON CONFLICT DO UPDATE SET played = 1', vid, dayOf(now))
    if (idOk(j.sid)) sql.exec('UPDATE a_sessions SET joined = 1, last = ? WHERE sid = ?', now, j.sid)
  }
  const x = vid ? isX(sql, vid) : 0
  sql.exec('INSERT INTO a_rooms (rid, code, created, day, creator, x) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(rid) DO NOTHING', j.rid, j.code, now, dayOf(now), vid, x)
  if (j.first) sql.exec('UPDATE a_rooms SET creator = ?, x = ? WHERE rid = ?', vid, x, j.rid)
  sql.exec('INSERT OR IGNORE INTO a_players (rid, pid, vid, joined) VALUES (?, ?, ?, ?)', j.rid, j.pid, vid, now)
}

export function roomMade(sql: Sql, rid: string, code: string, now = Date.now()) {
  if (!idOk(rid)) return
  sql.exec('INSERT OR IGNORE INTO a_rooms (rid, code, created, day) VALUES (?, ?, ?, ?)', rid, code, now, dayOf(now))
}

export interface GameStart { rid: string; gid: string; game: string; seq: number; players: number; night: boolean }
export function gameChosen(sql: Sql, g: GameStart, now = Date.now()) {
  if (!idOk(g.rid)) return
  const x = (sql.exec('SELECT x FROM a_rooms WHERE rid = ?', g.rid).toArray()[0]?.x as number | undefined) ?? 0
  sql.exec('INSERT OR IGNORE INTO a_games (gid, rid, game, seq, players, chosen, night, x) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    g.gid.slice(0, 60), g.rid, g.game.slice(0, 20), g.seq, g.players, now, g.night ? 1 : 0, x)
  sql.exec('UPDATE a_rooms SET games = games + 1, night = MAX(night, ?), first = COALESCE(first, ?) WHERE rid = ?', g.night ? 1 : 0, now, g.rid)
}

export interface GameEnd {
  gid: string; rid: string; outcome: 'done' | 'aborted'; began: number; players: number; readyAll: boolean
  acts: number; errs: number; dropped: number; rejoined: number
}
export function gameEnded(sql: Sql, g: GameEnd, now = Date.now()) {
  sql.exec(`UPDATE a_games SET ended = ?, outcome = ?, began = ?, players = ?, readyAll = ?, acts = ?, errs = ?, dropped = ?, rejoined = ? WHERE gid = ?`,
    now, g.outcome, g.began || null, g.players, g.readyAll ? 1 : 0, g.acts, g.errs, g.dropped, g.rejoined, g.gid)
  if (g.outcome === 'done') sql.exec('UPDATE a_rooms SET done = done + 1, last = ? WHERE rid = ?', now, g.rid)
}

/** Who is connected to a room right now (a browser id each), sent whenever that or the room's phase changes. */
export interface Presence { rid: string; phase: string; vids: string[] }
export function presence(sql: Sql, p: Presence, now = Date.now()) {
  if (!p.vids.length) sql.exec('DELETE FROM a_live WHERE rid = ?', p.rid)
  else sql.exec('INSERT INTO a_live (rid, phase, vids, at) VALUES (?, ?, ?, ?) ON CONFLICT(rid) DO UPDATE SET phase = excluded.phase, vids = excluded.vids, at = excluded.at',
    p.rid, p.phase, JSON.stringify(p.vids.slice(0, 40)), now)
}

export interface Feedback { vid: string; rid: string; game: string; rating?: number; again?: boolean; kind?: string; text?: string }
export function feedback(sql: Sql, f: Feedback, now = Date.now()) {
  const rating = Number.isInteger(f.rating) && f.rating! >= 1 && f.rating! <= 5 ? f.rating! : null
  const again = typeof f.again === 'boolean' ? (f.again ? 1 : 0) : null
  const text = short(f.text, 300).trim()
  if (rating === null && again === null && !text) return
  const kind = f.kind === 'idea' ? 'idea' : text ? 'fix' : null
  sql.exec('INSERT INTO a_feedback (at, vid, rid, game, rating, again, kind, text, x) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    now, f.vid, f.rid, short(f.game, 20), rating, again, kind, text || null, idOk(f.vid) ? isX(sql, f.vid) : 0)
}

// ---------- reading ----------

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (a: number, b: number) => (b ? a / b : null)
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Everything the Switchboard shows, for the last `days` days (0: since tracking began). */
export function report(sql: Sql, days: number, now = Date.now()) {
  const q = <T = Record<string, number | string | null>>(s: string, ...b: unknown[]) => sql.exec(s, ...b).toArray() as T[]
  const today = dayOf(now)
  const firstRow = q<{ d: string | null }>('SELECT MIN(day) d FROM a_visitors WHERE x = 0')[0]
  const since = firstRow?.d ?? today
  // A range never starts before counting did, so averages are not diluted by days with no data.
  const from = days > 0 && addDays(today, -(days - 1)) > since ? addDays(today, -(days - 1)) : since
  const real = new Set(q<{ vid: string }>('SELECT vid FROM a_visitors WHERE x = 0').map(r => r.vid))
  const testVids = new Set(q<{ vid: string }>('SELECT vid FROM a_visitors WHERE x = 1').map(r => r.vid))

  // Activity per day.
  const active = q<{ vid: string; day: string; played: number }>('SELECT vid, day, played FROM a_active WHERE day >= ?', addDays(from, -30)).filter(r => real.has(r.vid))
  const byDay = new Map<string, { v: Set<string>; p: Set<string> }>()
  for (const r of active) {
    const d = byDay.get(r.day) ?? { v: new Set(), p: new Set() }
    d.v.add(r.vid)
    if (r.played) d.p.add(r.vid)
    byDay.set(r.day, d)
  }
  const span = (end: string, n: number, which: 'v' | 'p') => {
    const s = new Set<string>()
    for (let i = 0; i < n; i++) for (const v of byDay.get(addDays(end, -i))?.[which] ?? []) s.add(v)
    return s.size
  }
  const visitors = q<{ vid: string; first: number; day: string; src: string; landing: string; invite: number; country: string; device: string }>('SELECT * FROM a_visitors WHERE x = 0')
  const newIn = visitors.filter(v => v.day >= from)

  // Rooms and games (rooms made by a test browser, or whose every player was one, are left out).
  const roomsAll = q<{ rid: string; created: number; day: string; creator: string; games: number; done: number; first: number | null; last: number | null; night: number; x: number }>('SELECT * FROM a_rooms')
  const playersAll = q<{ rid: string; pid: string; vid: string; joined: number }>('SELECT * FROM a_players')
  const roomPlayers = new Map<string, string[]>()
  for (const p of playersAll) roomPlayers.set(p.rid, [...(roomPlayers.get(p.rid) ?? []), p.vid])
  // A room counts once someone has sat in it (making one always seats its maker).
  const isRealRoom = (r: { rid: string; x: number; creator: string }) => !r.x && !testVids.has(r.creator) && (roomPlayers.get(r.rid) ?? []).some(v => !testVids.has(v))
  const rooms = roomsAll.filter(r => r.day >= from && isRealRoom(r))
  const realRids = new Set(roomsAll.filter(isRealRoom).map(r => r.rid))
  const gamesAll = q<{ gid: string; rid: string; game: string; seq: number; players: number; chosen: number; began: number | null; ended: number | null; outcome: string | null; night: number; readyAll: number; acts: number; errs: number; dropped: number; rejoined: number }>('SELECT * FROM a_games ORDER BY chosen')
    .filter(g => realRids.has(g.rid))
  const games = gamesAll.filter(g => dayOf(g.chosen) >= from)
  const STALE = 6 * 3_600_000
  // Right now: people connected to a room, from what each room last reported. A room that has not reported for 6 hours
  // without emptying is taken to have closed without saying so.
  const presenceNow = { online: 0, rooms: 0, playing: 0, waiting: 0 }
  for (const r of q<{ phase: string; vids: string }>('SELECT phase, vids FROM a_live WHERE at > ?', now - STALE)) {
    const real = (JSON.parse(r.vids) as string[]).filter(v => !testVids.has(v)).length
    if (!real) continue
    presenceNow.rooms++
    presenceNow.online += real
    if (r.phase === 'game') presenceNow.playing += real; else presenceNow.waiting += real
  }
  const ended = games.filter(g => g.ended)
  const done = games.filter(g => g.outcome === 'done')
  const aborted = games.filter(g => g.outcome === 'aborted')
  const unfinished = games.filter(g => !g.ended && now - g.chosen > STALE)
  const settled = ended.length + unfinished.length

  // A room is one night: its players, its games, and the time from the first game to the last one finished.
  const started = rooms.filter(r => r.games > 0)
  const gamesBy = new Map<string, typeof games>()
  for (const g of gamesAll) gamesBy.set(g.rid, [...(gamesBy.get(g.rid) ?? []), g])
  const sizes = started.map(r => new Set(roomPlayers.get(r.rid) ?? []).size)
  const nightMin = started.map(r => {
    const gs = gamesBy.get(r.rid) ?? []
    const end = Math.max(...gs.map(g => g.ended ?? 0))
    return end > r.first! ? (end - r.first!) / 60_000 : 0
  }).filter(m => m > 0)
  const doneCounts = started.map(r => r.done)

  // Day-N retention, counted on players: of everyone who first played on day D, who opened the site again on day D+N.
  const firstPlay = new Map<string, string>()
  for (const r of q<{ vid: string; d: string }>('SELECT vid, MIN(day) d FROM a_active WHERE played = 1 GROUP BY vid')) if (real.has(r.vid)) firstPlay.set(r.vid, r.d)
  const seen = new Set(q<{ vid: string; day: string }>('SELECT vid, day FROM a_active').map(r => r.vid + '|' + r.day))
  const ret = (n: number) => {
    let eligible = 0, back = 0, within = 0
    for (const [vid, d] of firstPlay) {
      if (d < from || addDays(d, n) >= today) continue
      eligible++
      if (seen.has(vid + '|' + addDays(d, n))) back++
      for (let i = 1; i <= n; i++) if (seen.has(vid + '|' + addDays(d, i))) { within++; break }
    }
    return { n: eligible, back, pct: pct(back, eligible), within: pct(within, eligible) }
  }

  // Players at once: a sweep over every game's start and end.
  const marks: [number, number][] = []
  for (const g of games) if (g.began) { marks.push([g.began, g.players]); marks.push([g.ended ?? Math.min(now, g.began + STALE), -g.players]) }
  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let at = 0, peak = 0, peakAt = 0
  for (const [t, d] of marks) { at += d; if (at > peak) { peak = at; peakAt = t } }
  const liveGames = gamesAll.filter(g => g.began && !g.ended && now - g.began < STALE)

  // Invites and spread.
  const counts = q<{ day: string; kind: string; key: string; n: number }>('SELECT * FROM a_counts WHERE day >= ?', from)
  const sum = (kind: string) => counts.filter(c => c.kind === kind).reduce((a, c) => a + c.n, 0)
  const sessions = q<{ sid: string; vid: string; day: string; src: string; landing: string; views: number; joined: number; err: number }>('SELECT * FROM a_sessions WHERE day >= ?', from).filter(s => real.has(s.vid))
  const invitedNew = newIn.filter(v => v.invite)
  const referred = new Set(visitors.filter(v => v.invite).map(v => v.vid))
  const creators = new Set(started.map(r => r.creator))

  // Feedback.
  const fb = q<{ at: number; game: string; rating: number | null; again: number | null; kind: string | null; text: string | null; x: number }>('SELECT * FROM a_feedback WHERE at >= ? AND x = 0', dayMs(from))
  const rated = fb.filter(f => f.rating !== null)
  const voted = fb.filter(f => f.again !== null)
  const texts = (kind: string) => {
    const m = new Map<string, { text: string; n: number; last: number; game: string }>()
    for (const f of fb) if (f.kind === kind && f.text) {
      const k = norm(f.text)
      const e = m.get(k) ?? { text: f.text, n: 0, last: 0, game: f.game }
      e.n++
      if (f.at > e.last) { e.last = f.at; e.text = f.text; e.game = f.game }
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 15)
  }

  // Per game.
  const ids = [...new Set(games.map(g => g.game))]
  const byGame = ids.map(id => {
    const gs = games.filter(g => g.game === id)
    const fin = gs.filter(g => g.outcome === 'done' && g.began)
    const r = rated.filter(f => f.game === id), v = voted.filter(f => f.game === id)
    // Played again: the room's next game was this one too.
    const next = gs.filter(g => (gamesBy.get(g.rid) ?? []).some(h => h.seq === g.seq + 1))
    const again = next.filter(g => (gamesBy.get(g.rid) ?? []).find(h => h.seq === g.seq + 1)?.game === id)
    return {
      id, started: gs.length, done: fin.length, completion: pct(fin.length, gs.filter(g => g.ended || now - g.chosen > STALE).length),
      avgPlayers: round(gs.reduce((a, g) => a + g.players, 0) / gs.length), medianMin: round(median(fin.map(g => (g.ended! - g.began!) / 60_000))),
      replay: pct(again.length, next.length), rating: r.length ? round(r.reduce((a, f) => a + f.rating!, 0) / r.length, 2) : null, ratings: r.length,
      again: pct(v.filter(f => f.again).length, v.length),
    }
  }).sort((a, b) => b.started - a.started)

  const hours = Array.from({ length: 24 }, () => 0)
  for (const g of games) hours[new Date(g.chosen + IST).getUTCHours()]++
  const series = []
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const a = byDay.get(d)
    series.push({
      day: d, visitors: a?.v.size ?? 0, players: a?.p.size ?? 0, newVisitors: visitors.filter(v => v.day === d).length,
      rooms: rooms.filter(r => r.day === d).length, games: games.filter(g => dayOf(g.chosen) === d).length,
    })
  }
  const tally = <T>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(key(x) || 'Unknown', (m.get(key(x) || 'Unknown') ?? 0) + 1)
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n)
  }
  const played = new Set(active.filter(a => a.played && a.day >= from).map(a => a.vid))
  const newPlayed = newIn.filter(v => played.has(v.vid))
  const multi = new Set<string>()
  const roomsOf = new Map<string, number>()
  for (const p of playersAll) if (realRids.has(p.rid) && (gamesBy.get(p.rid)?.length ?? 0) > 0) roomsOf.set(p.vid, (roomsOf.get(p.vid) ?? 0) + 1)
  for (const [vid, n] of roomsOf) if (n > 1) multi.add(vid)
  const daysActive = new Map<string, Set<string>>()
  for (const a of active) if (a.day >= from) daysActive.set(a.vid, (daysActive.get(a.vid) ?? new Set()).add(a.day))

  const seats = ended.filter(g => g.began).reduce((a, g) => a + g.players, 0)
  const dropped = ended.reduce((a, g) => a + (g.dropped ?? 0), 0)
  const rejoined = ended.reduce((a, g) => a + (g.rejoined ?? 0), 0)

  return {
    now, today, since, from, days, tz: 'IST (UTC+5:30)',
    live: { games: liveGames.length, players: liveGames.reduce((a, g) => a + g.players, 0), ...presenceNow },
    acquisition: {
      dau: byDay.get(today)?.v.size ?? 0, wau: span(today, 7, 'v'), mau: span(today, 30, 'v'),
      dauPlayers: byDay.get(today)?.p.size ?? 0, wauPlayers: span(today, 7, 'p'), mauPlayers: span(today, 30, 'p'),
      avgDau: round(series.reduce((a, s) => a + s.visitors, 0) / series.length), avgDauPlayers: round(series.reduce((a, s) => a + s.players, 0) / series.length),
      visitors: new Set(active.filter(a => a.day >= from).map(a => a.vid)).size, newVisitors: newIn.length,
      sessions: sessions.length, viewsPerSession: sessions.length ? round(sessions.reduce((a, s) => a + s.views, 0) / sessions.length) : null,
      sources: tally(newIn, v => (v.invite ? 'Room link' : v.src)).map(s => ({ ...s, played: newIn.filter(v => (v.invite ? 'Room link' : v.src) === s.label && played.has(v.vid)).length })),
      referrers: tally(newIn.filter(v => !v.invite && v.src !== 'Direct'), v => v.src),
      landings: tally(newIn, v => (v.landing.startsWith('/r/') ? '/r/ (room link)' : v.landing)).slice(0, 10),
      countries: tally(newIn, v => v.country).slice(0, 10), devices: tally(newIn, v => v.device),
    },
    funnel: {
      newVisitors: newIn.length, played: newPlayed.length, twoRooms: newPlayed.filter(v => multi.has(v.vid)).length,
      returned: newIn.filter(v => (daysActive.get(v.vid)?.size ?? 0) > 1).length,
    },
    activation: {
      created: rooms.length, started: started.length, rate: pct(started.length, rooms.length),
      avgPlayers: sizes.length ? round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : null, medianPlayers: median(sizes),
      avgSeats: games.length ? round(games.reduce((a, g) => a + g.players, 0) / games.length) : null,
      sizes: [['Solo', 1, 1], ['2–3', 2, 3], ['4–6', 4, 6], ['7–10', 7, 10], ['11+', 11, 99]].map(([label, lo, hi]) => ({ label, n: sizes.filter(s => s >= (lo as number) && s <= (hi as number)).length })),
    },
    engagement: {
      games: games.length, done: done.length, gamesPerRoom: started.length ? round(games.filter(g => started.some(r => r.rid === g.rid)).length / started.length) : null,
      medianGamesPerNight: median(doneCounts), medianNightMin: round(median(nightMin)), avgNightMin: nightMin.length ? round(nightMin.reduce((a, b) => a + b, 0) / nightMin.length) : null,
      // Of rooms that started a game, how many went on to start a second; of those, a third.
      completed: pct(done.length, settled), second: pct(started.filter(r => r.games >= 2).length, started.length),
      third: pct(started.filter(r => r.games >= 3).length, started.filter(r => r.games >= 2).length),
      nightPlanner: pct(started.filter(r => r.night).length, started.length),
      medianGameMin: round(median(done.filter(g => g.began).map(g => (g.ended! - g.began!) / 60_000))),
      playerHours: round(done.filter(g => g.began).reduce((a, g) => a + ((g.ended! - g.began!) / 3_600_000) * g.players, 0)),
      rulesSkipped: pct(ended.filter(g => g.began && g.readyAll).length, ended.filter(g => g.began).length),
      medianRulesSec: round(median(ended.filter(g => g.began).map(g => (g.began! - g.chosen) / 1000)), 0),
      peakPlayers: peak, peakAt: peakAt || null, hours, byGame,
      multiRoom: pct([...played].filter(v => multi.has(v)).length, played.size),
    },
    retention: { d1: ret(1), d7: ret(7), d14: ret(14), d30: ret(30), cohort: firstPlay.size },
    virality: {
      shares: sum('share'), sharesNative: counts.filter(c => c.kind === 'share' && c.key === 'native').reduce((a, c) => a + c.n, 0),
      inviteOpens: sessions.filter(s => s.landing.startsWith('/r/')).length, newFromInvites: invitedNew.length,
      newFromInvitesPlayed: invitedNew.filter(v => played.has(v.vid)).length, shareOfNew: pct(invitedNew.length, newIn.length),
      playersPerRoom: sizes.length ? round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : null,
      roomsByReferred: started.filter(r => referred.has(r.creator)).length, roomsStarted: started.length,
      // New players a room creator brings in: everyone new who came through a room link, per person who started a room.
      perHost: creators.size ? round(invitedNew.filter(v => played.has(v.vid)).length / creators.size, 2) : null,
    },
    quality: {
      completion: pct(done.length, settled), aborted: pct(aborted.length, settled), unfinished: pct(unfinished.length, settled),
      dropRate: pct(dropped, seats), dropped, seats, reconnect: pct(rejoined, dropped), rejoined,
      errorSessions: pct(sessions.filter(s => s.err).length, sessions.length), errorGames: pct(ended.filter(g => g.errs).length, ended.length),
      actions: ended.reduce((a, g) => a + (g.acts ?? 0), 0), serverErrors: ended.reduce((a, g) => a + (g.errs ?? 0), 0),
      topErrors: counts.filter(c => c.kind === 'err').reduce((m, c) => m.set(c.key, (m.get(c.key) ?? 0) + c.n), new Map<string, number>()),
    },
    feedback: {
      responses: fb.length, ratings: rated.length, avgRating: rated.length ? round(rated.reduce((a, f) => a + f.rating!, 0) / rated.length, 2) : null,
      stars: [1, 2, 3, 4, 5].map(s => rated.filter(f => f.rating === s).length),
      againVotes: voted.length, again: pct(voted.filter(f => f.again).length, voted.length),
      complaints: texts('fix'), ideas: texts('idea'),
    },
    series,
  }
}

/** report() with the error map turned into a list, ready for JSON. */
export function reportJson(sql: Sql, days: number, now = Date.now()) {
  const r = report(sql, days, now)
  return { ...r, names: Object.fromEntries(CATALOG.map(m => [m.id, m.name])), quality: { ...r.quality, topErrors: [...r.quality.topErrors.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 10) } }
}
