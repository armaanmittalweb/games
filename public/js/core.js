// Connection, clock and shared state. The server owns every game; this file only carries messages both ways.
import { VID, session, track } from './track.js'
import { showText } from './dialog.js'

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}
export const local = store

const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')
// The id and secret predate game nights (wr. = Word Race), so returning players keep their seat in a room.
let id = store.get('wr.id', ''), secret = store.get('wr.secret', '')
if (!id) { id = rand(8); secret = rand(16); store.set('wr.id', id); store.set('wr.secret', secret) }
export const ME = id

export const getName = () => store.get('wr.name', '')
export const setName = n => store.set('wr.name', n)

/** Everything the page knows about the room it is in. */
export const S = { code: null, room: null, game: null, gameN: 0, you: ME, chat: [], unread: 0, chatOpen: false, status: 'idle', closed: null, missed: null, recap: null, screen: false }
/** Phases in which a game shows how a round ended. */
export const REVEALS = new Set(['reveal', 'result'])
let offset = 0
export const now = () => Date.now() + offset

const subs = new Set()
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
export const changed = () => { for (const fn of subs) fn() }

const evSubs = new Set()
/** Messages that are not part of the state (pen strokes, guesses). Returns an unsubscribe function. */
export const onEvent = fn => { evSubs.add(fn); return () => evSubs.delete(fn) }

let ws = null, retry = 0, pingT = null, wanted = null, heard = 0, probe = null
/** On a new line: the game view this page had before, to tell whether a reveal went by while it was away. */
let before = null
/** The last reveal (a round's answers) this page got, when, and since when the page has been in view. */
let lastReveal = null, inView = Date.now()

/** Joins a room as a player, or (`{ tv: true }`) as a shared screen that shows the room to everyone and never plays. */
export function connect(code, { tv = false } = {}) {
  if (wanted === code && ws && S.screen === tv) return
  disconnect()
  S.screen = tv
  wanted = code
  before = lastReveal = null
  Object.assign(S, { code, room: null, game: null, gameN: 0, chat: [], unread: 0, status: 'connecting', closed: null, missed: null, recap: null })
  changed()
  open()
}

function open() {
  const code = wanted
  if (!code) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const sock = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws`)
  ws = sock
  sock.onopen = () => {
    retry = 0
    heard = Date.now()
    before = S.game && !S.screen ? { n: S.gameN, v: S.game } : null
    sock.send(JSON.stringify(S.screen ? { t: 'join', tv: true } : { t: 'join', id: ME, secret, name: getName(), vid: VID, sid: session() }))
    clearInterval(pingT)
    // A line can die and still say it is open (a network that changed, a carrier that dropped it): nothing arrives
    // and nothing tells us. So a quiet line is asked to answer: after 5 s in a game, where a missed update means a
    // missed reveal, and after 25 s otherwise.
    pingT = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const quiet = Date.now() - heard
      if (quiet > (S.room?.phase === 'game' ? 5000 : 25000)) check(sock)
      // A round's time ran out a moment ago and nothing has come since: the reveal should have.
      const due = S.room?.phase === 'game' ? S.game?.until : 0
      if (due && now() > due + 1200 && heard + offset < due) check(sock)
    }, 1000)
  }
  sock.onmessage = e => {
    // A line already given up on can still deliver what it had queued; that is older than what the new line sent.
    if (ws !== sock) return
    heard = Date.now()
    if (e.data === 'pong') return
    const m = JSON.parse(e.data)
    if (m.t === 's') {
      offset = m.now - Date.now()
      S.room = m.room
      S.you = m.you
      S.status = 'open'
      const inst = m.room.inst
      if (!inst) { S.game = null; S.gameN = 0 }
      else if (m.game) {
        const was = before, v = m.game.v
        before = null
        S.game = v; S.gameN = m.game.n
        // The round just ended: kept for the line at the top of the next round, and so the page can buzz once for it.
        if (REVEALS.has(v?.phase)) {
          const key = `${m.game.n}:${v.round ?? ''}:${v.turn ?? ''}`
          if (S.recap?.key === key) S.recap.v = v
          else S.recap = { n: m.game.n, key, v }
        }
        if (v?.phase === 'reveal') lastReveal = { n: m.game.n, v, at: Date.now() }
        else if (lastReveal?.n === m.game.n && typeof v?.round === 'number' && v.round > lastReveal.v.round) {
          // The round moved on. A reveal that was on screen for a moment only (a page the phone had paused gets it and
          // the next round together) or while the page was hidden is offered again.
          if (Date.now() - Math.max(lastReveal.at, inView) < 1500 || document.visibilityState !== 'visible') S.missed = { n: lastReveal.n, v: lastReveal.v }
          lastReveal = null
        } else if (was && missedReveal(was, m.game)) send({ t: 'missed' })
      }
      else if (S.gameN !== inst.n) { S.game = null; S.gameN = inst.n }
      changed()
    } else if (m.t === 'react') {
      for (const fn of evSubs) fn({ k: 'react', id: m.id, r: m.r })
    } else if (m.t === 'missed') {
      if (m.n === S.gameN) { S.missed = { n: m.n, v: m.v }; changed() }
    } else if (m.t === 'ev') {
      for (const fn of evSubs) fn(m.ev)
    } else if (m.t === 'chat') {
      if (m.all) S.chat = m.all
      else { S.chat = [...S.chat.slice(-79), m.m]; if (!S.chatOpen && m.m.id !== ME) S.unread++ }
      changed()
    } else if (m.t === 'error') {
      // A game that shows the message in place (Word Grid under its word) returns true, and no toast covers it.
      let shown = false
      for (const fn of evSubs) if (fn({ k: 'error', msg: m.msg }) === true) shown = true
      if (!shown) toast(m.msg)
    }
  }
  sock.onclose = e => {
    if (ws !== sock) return
    ws = null
    clearInterval(pingT)
    if (e.code === 4000) { S.closed = 'elsewhere'; changed(); return }
    if (e.code === 4001) { S.closed = 'removed'; changed(); return }
    S.status = 'reconnecting'
    changed()
    // Never in this room yet and the line keeps failing: ask whether the room exists at all (a plain request to the
    // room answers 404 when there is none), so a bad network is not mistaken for a closed room.
    if (!S.room && retry > 1) {
      fetch(`/api/rooms/${code}/ws`).then(r => { if (r.status === 404 && wanted === code && !S.room) { S.closed = 'missing'; changed() } }, () => {})
    }
    const wait = Math.min(8000, 500 * 2 ** retry++)
    setTimeout(() => { if (wanted === code && !ws && !S.closed) open() }, wait)
  }
}

/** Back on a new line in the same game, a round further on, without having seen the reveal in between. */
function missedReveal(was, next) {
  const a = was.v, b = next.v
  if (was.n !== next.n || !a || !b || a.phase === 'reveal' || b.phase === 'reveal') return false
  return typeof a.round === 'number' && typeof b.round === 'number' && b.round > a.round
}

/**
 * Asks the line to answer (the room answers a ping at once, without waking up). No answer within 3 s and the line is
 * dead though it says it is open: a new one is opened, and the room sends everything afresh.
 */
function check(sock = ws) {
  if (!sock || ws !== sock || sock.readyState !== 1 || probe) return
  const asked = Date.now()
  try { sock.send('ping') } catch { return drop(sock) }
  probe = setTimeout(() => { probe = null; if (ws === sock && heard < asked) drop(sock) }, 3000)
}

/** Closes a line that has gone quiet and opens a new one now. */
function drop(sock) {
  if (ws !== sock) return
  ws = null
  clearInterval(pingT)
  clearTimeout(probe)
  probe = null
  try { sock.close() } catch { /* closed */ }
  S.status = 'reconnecting'
  changed()
  retry = 0
  open()
}

// Back from a locked screen, another app or a dead network: reconnect at once instead of waiting out the back-off,
// and check that an "open" line still answers.
function wake() {
  if (!wanted || S.closed || document.visibilityState !== 'visible') return
  if (!ws || ws.readyState > 1) { retry = 0; ws = null; return open() }
  if (ws.readyState === 1 && Date.now() - heard > 3000) check()
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') inView = Date.now(); wake(); awake() })
addEventListener('online', wake)
addEventListener('pageshow', e => { if (e.persisted) wake() })

// While in a room the screen stays on: a phone left on the table should not lock mid-game. The browser drops the
// lock whenever the page is hidden, so it is asked for again on return.
let lock = null, wantLock = false
async function awake() {
  if (!wantLock || lock || document.visibilityState !== 'visible' || !navigator.wakeLock) return
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null }) } catch { /* low battery, or not allowed */ }
}
export function keepAwake(on) {
  wantLock = on
  if (on) awake()
  else if (lock) { lock.release().catch(() => {}); lock = null }
}

export function disconnect() {
  const s = ws
  ws = null
  wanted = null
  clearInterval(pingT)
  clearTimeout(probe)
  probe = null
  if (s) try { s.close() } catch { /* closed */ }
}

export function send(m) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(m))
    session()
    // Nearly every message gets an answer from the room. None soon after means the line may be dead: the move
    // may not have arrived, and the next update (a reveal) would not either.
    const at = Date.now()
    setTimeout(() => { if (heard < at) check() }, 2500)
  } else toast('Reconnecting…')
}
/** A move in the current game. */
export const act = m => send({ t: 'g', ...m })

let toastT = null
export function toast(msg, ms = 2000) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastT)
  toastT = setTimeout(() => { el.hidden = true }, ms)
}

export async function share(text, url) {
  // A room link going out is an invite (counted for the Switchboard).
  if (url?.includes('/r/')) track('share', { method: navigator.share ? 'native' : 'copy' })
  if (navigator.share) { try { await navigator.share({ text, url }); return } catch { /* cancelled */ } }
  await copy(url ? `${text} ${url}` : text)
}

/** Puts text on the clipboard, with a fallback for browsers that refuse (old ones, or no permission). */
export async function copy(text, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(done); return true } catch { /* below */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.append(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* below */ }
  ta.remove()
  if (ok) toast(done); else showText({ title: 'Copy this', body: 'This browser would not copy it for you. Select it and copy.', text })
  return ok
}

/** A room code from whatever was typed or pasted: the code itself, a room link, or the share message with a link. */
export function codeFrom(text) {
  const t = String(text ?? '').trim()
  const link = t.match(/\/r\/([A-Za-z0-9]{5})(?![A-Za-z0-9])/)
  if (link) return link[1].toUpperCase()
  if (/\/r\//.test(t)) return ''
  // "Join my game night room ABCDE": the code is the five-character word in capitals.
  if (t.length > 7) {
    const words = t.split(/[^A-Za-z0-9]+/).filter(w => /^[A-Z0-9]{5}$/.test(w))
    if (words.length) return words[words.length - 1]
  }
  return t.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase()
}
