// Connection, clock and shared state. The server owns every game; this file only carries messages both ways.

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

let ws = null, retry = 0, pingT = null, wanted = null

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
    sock.send(JSON.stringify({ t: 'join', id: ME, secret, name: getName() }))
    clearInterval(pingT)
    pingT = setInterval(() => { try { sock.send('ping') } catch { /* closed */ } }, 25000)
  }
  sock.onmessage = e => {
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
    if (!S.room && retry > 1) { S.closed = 'missing'; changed(); return }
    S.status = 'reconnecting'
    changed()
    const wait = Math.min(8000, 500 * 2 ** retry++)
    setTimeout(() => { if (wanted === code && !ws) open() }, wait)
  }
}

export function disconnect() {
  const s = ws
  ws = null
  wanted = null
  clearInterval(pingT)
  if (s) try { s.close() } catch { /* closed */ }
}

export function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m))
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
  if (navigator.share) { try { await navigator.share({ text, url }); return } catch { /* cancelled */ } }
  try { await navigator.clipboard.writeText(url ? `${text} ${url}` : text); toast('Copied') } catch { prompt('Copy this', url ?? text) }
}
