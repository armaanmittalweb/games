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
export const S = { code: null, room: null, game: null, gameN: 0, you: ME, chat: [], unread: 0, chatOpen: false, status: 'idle', closed: null }
let offset = 0
export const now = () => Date.now() + offset

const subs = new Set()
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
export const changed = () => { for (const fn of subs) fn() }

const evSubs = new Set()
/** Messages that are not part of the state (pen strokes, guesses). Returns an unsubscribe function. */
export const onEvent = fn => { evSubs.add(fn); return () => evSubs.delete(fn) }

let ws = null, retry = 0, pingT = null, wanted = null, heard = 0

export function connect(code) {
  if (wanted === code && ws) return
  disconnect()
  wanted = code
  Object.assign(S, { code, room: null, game: null, gameN: 0, chat: [], unread: 0, status: 'connecting', closed: null })
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
    sock.send(JSON.stringify({ t: 'join', id: ME, secret, name: getName(), vid: VID, sid: session() }))
    clearInterval(pingT)
    pingT = setInterval(() => {
      // A line that went quiet (a phone that slept, a network that changed) can stay "open" without carrying
      // anything. Two missed pongs and it is replaced.
      if (Date.now() - heard > 60000) return drop(sock)
      try { sock.send('ping') } catch { /* closed */ }
    }, 25000)
  }
  sock.onmessage = e => {
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
      else if (m.game) { S.game = m.game.v; S.gameN = m.game.n }
      else if (S.gameN !== inst.n) { S.game = null; S.gameN = inst.n }
      changed()
    } else if (m.t === 'ev') {
      for (const fn of evSubs) fn(m.ev)
    } else if (m.t === 'chat') {
      if (m.all) S.chat = m.all
      else { S.chat = [...S.chat.slice(-79), m.m]; if (!S.chatOpen && m.m.id !== ME) S.unread++ }
      changed()
    } else if (m.t === 'error') {
      toast(m.msg)
      for (const fn of evSubs) fn({ k: 'error', msg: m.msg })
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

/** Closes a line that has gone quiet and opens a new one now. */
function drop(sock) {
  if (ws !== sock) return
  ws = null
  clearInterval(pingT)
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
  if (ws.readyState === 1 && Date.now() - heard > 8000) {
    const sock = ws, asked = Date.now()
    try { sock.send('ping') } catch { return drop(sock) }
    setTimeout(() => { if (ws === sock && heard < asked) drop(sock) }, 4000)
  }
}
document.addEventListener('visibilitychange', () => { wake(); awake() })
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
  if (s) try { s.close() } catch { /* closed */ }
}

export function send(m) {
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); session() }
  else toast('Reconnecting…')
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
