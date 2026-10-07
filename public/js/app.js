// Game Night: the page around the games. Home, rooms, the library, game nights, results and chat.
import { html, render, useState, useEffect, useRef } from './preact.js'
import { S, ME, connect, disconnect, send, subscribe, changed, toast, share, copy, codeFrom, keepAwake, getName, setName, now } from './core.js'
import { Avatar, Name, nameOf, plural, useTick } from './ui.js'
import { pageView, track } from './track.js'
import { ask, dismiss, dialogOpen } from './dialog.js'
import { Results } from './results.js'
import { CATALOG } from '/catalog.js'

export const META = Object.fromEntries(CATALOG.map(m => [m.id, m]))
const MOODS = { think: '🧠 Think', chaos: '😂 Chaos', competitive: '🎯 Competitive', deception: '🕵️ Deception', creative: '🎨 Creative', fast: '⚡ Fast', social: '🗣️ Social', strategic: '♟️ Strategic' }
const LENGTHS = [['quick', 'Quick', '15 min'], ['standard', 'Standard', '30 min'], ['chaos', 'Chaos', '45 min'], ['tournament', 'Tournament', 'knockout'], ['endless', 'Endless', '∞']]
const CATS = ['Word', 'Drawing', 'Party', 'Deception', 'Trivia', 'Puzzle', 'Strategy', 'Cards', 'Reflex']
const DNA = [['skill', 'Skill'], ['luck', 'Luck'], ['social', 'Social'], ['brain', 'Brain'], ['chaos', 'Chaos'], ['replay', 'Replay']]
const estMinutes = (m, n) => Math.round(m.minutes[0] + m.minutes[1] * n)
const players = (m) => m.min === m.max ? `${m.min}` : `${m.min}–${m.max}`

// ---------- store hook and routing ----------

function useStore() {
  const [, set] = useState(0)
  useEffect(() => subscribe(() => set(x => x + 1)), [])
  return S
}

let pending = null // what to do once a room this page just made is open: { code, pick, start }
const HOME_TITLE = document.title

function route() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{5})\/?$/)
  document.body.dataset.view = m ? 'room' : 'home'
  if (m) return { room: m[1].toUpperCase() }
  guarded = null
  leaving = false
  disconnect()
  document.title = HOME_TITLE
  return { room: null }
}

export function go(path) {
  history.pushState(null, '', path)
  window.dispatchEvent(new Event('route'))
  countView()
}

// Page views: the site's own count (track.js, for the Game Night page in the Switchboard), and the Switchboard's
// traffic count across every amittal.dev site (api.amittal.dev/hit: page and referrer only, no cookies or ids).
let viewed = ''
function countView() {
  const path = location.pathname.startsWith('/r/') ? '/r/' : location.pathname
  pageView(path)
  if (!navigator.sendBeacon || navigator.webdriver || !location.hostname.endsWith('amittal.dev')) return
  if (path === viewed) return
  const ref = viewed ? '' : document.referrer
  viewed = path
  try { navigator.sendBeacon('https://api.amittal.dev/hit', JSON.stringify({ s: 'games', p: path, r: ref })) } catch { /* never break the page */ }
}

async function createRoom(pick, start = false) {
  const r = await fetch('/api/rooms', { method: 'POST' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Could not make a room')
  pending = { code: j.code, pick, start }
  go('/r/' + j.code)
}

// ---------- leaving a room ----------

// Back (often a stray edge swipe on a phone) should not drop anyone out of a room. Once in a room the page adds a
// second history entry for it, the guard, so Back first lands on the room's own entry: we ask, and either put the
// guard back (stay) or carry on back to wherever they came from (leave).
let guarded = null // the room whose guard entry is in the history
let leaving = false // the player chose to leave: the next Back is let through

function guard(code) {
  if (guarded === code && history.state?.guard === code) return
  guarded = code
  if (history.state?.guard !== code) history.pushState({ guard: code }, '', `/r/${code}`)
}

/** The question before leaving a room, with what leaving means right now. */
function askLeave() {
  const room = S.room
  const inGame = room?.phase === 'game' && room.inst
  const playing = inGame && room.inst.players.includes(ME)
  const host = room?.host === ME && room.members.some(m => m.online && m.id !== ME)
  const body = [
    playing ? `You are playing ${META[room.inst.id].name}. It goes on without you.` : '',
    `You can come back with the code ${room?.code ?? ''}.`,
    host ? 'Someone else becomes the host.' : '',
  ].filter(Boolean).join(' ')
  return ask({ title: 'Leave the room?', body, ok: 'Leave', cancel: 'Stay', danger: true })
}

/** Back was pressed in a room. `onRoom`: it landed on the room's own entry (the usual case) rather than past it. */
async function backPressed(code, onRoom, setWhere) {
  const leave = await askLeave()
  if (leaving || guarded !== code) return // a second Back already took them out
  if (!leave) { history.pushState({ guard: code }, '', `/r/${code}`); return }
  leaving = true
  if (onRoom) history.back() // on to the page before the room
  else setWhere(route())
}

// ---------- app ----------

function App() {
  const [where, setWhere] = useState(route())
  useEffect(() => {
    const on = e => {
      if (e?.type === 'popstate' && guarded && S.room && !S.closed && !leaving) {
        const code = guarded
        if (location.pathname === `/r/${code}` && history.state?.guard === code) return setWhere(route())
        const onRoom = location.pathname === `/r/${code}`
        // Back again while we are asking: that is a clear answer.
        if (!onRoom && dialogOpen()) { leaving = true; dismiss(); return setWhere(route()) }
        dismiss()
        backPressed(code, onRoom, setWhere)
        return
      }
      setWhere(route())
    }
    window.addEventListener('popstate', on)
    window.addEventListener('route', on)
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('route', on) }
  }, [])
  return where.room ? html`<${RoomGate} code=${where.room} />` : html`<${Home} />`
}

function NameField({ value, onInput, onEnter }) {
  return html`<div><label for="name">Your name</label>
    <input id="name" maxlength="16" autocomplete="nickname" placeholder="e.g. Armaan" value=${value} onInput=${e => onInput(e.target.value)} onKeyDown=${e => e.key === 'Enter' && onEnter?.()} /></div>`
}

function Home() {
  const [name, setN] = useState(getName())
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [cat, setCat] = useState('All')
  const need = () => { const n = name.trim(); if (!n) { toast('Enter your name first'); document.getElementById('name')?.focus(); return null } setName(n); return n }
  const make = async (pick, start) => {
    if (!need()) return
    setBusy(true)
    try { await createRoom(pick, start) } catch (e) { toast(e.message); setBusy(false) }
  }
  // Links from the guide pages: /?play=<game> opens a room with that game picked; /?solo=1 starts a Word Race alone.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('me') === '1') { history.replaceState(null, '', '/'); toast('This browser is now left out of the site\'s numbers', 3000); return }
    const play = q.get('play'), solo = q.get('solo') === '1'
    if (!play && !solo) return
    history.replaceState(null, '', '/')
    if (getName()) make(solo ? 'wordle' : play, solo)
    else toast('Enter your name, then tap the game again', 2600)
  }, [])
  const join = () => {
    const c = codeFrom(code)
    if (!need()) return
    if (!/^[A-Z0-9]{5}$/.test(c)) return toast('Room codes are 5 characters')
    go('/r/' + c)
  }
  const list = CATALOG.filter(m => cat === 'All' || m.cat === cat)
  return html`<div class="wrap home">
    <div class="brandline"><span>🎲 Game Night</span><span class="row"><a href="/games">All games</a><${ThemeButton} /></span></div>
    <section class="hero">
      <div class="hero-text">
        <h1>Game night with your friends, in the browser</h1>
        <p class="lead">${CATALOG.length} party games for 2 to 30 people. Make a room, share the code, play on any phone or laptop. Free, no sign-up.</p>
      </div>
      <div class="card stack hero-card">
        <${NameField} value=${name} onInput=${setN} onEnter=${() => make(null)} />
        <button class="primary big" disabled=${busy} onClick=${() => make(null)}>Create a room</button>
        <div class="or"><span>or join one</span></div>
        <div class="row"><input class="grow code-in" value=${code} onInput=${e => { const c = codeFrom(e.target.value); setCode(c); e.target.value = c }} onKeyDown=${e => e.key === 'Enter' && join()} placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Room code, or paste the room link" /><button onClick=${join}>Join</button></div>
      </div>
    </section>
    <section>
      <div class="row between"><h2>Games</h2><div class="chips">${['All', ...CATS].map(c => html`<button key=${c} class=${'chipbtn' + (cat === c ? ' sel' : '')} onClick=${() => setCat(c)}>${c}</button>`)}</div></div>
      <div class="lib">${list.map(m => html`<div key=${m.id} class="gcard">
        <div class="gc-top"><${GameIcon} m=${m} /><div><a class="gname" href=${'/games/' + m.id}>${m.name}</a><div class="dim small">${players(m)} players · ${m.cat}</div></div></div>
        <p class="small">${m.blurb}</p>
        <button class="primary" disabled=${busy} onClick=${() => make(m.id)}>Play</button>
      </div>`)}</div>
    </section>
  </div>`
}

function RoomGate({ code }) {
  const s = useStore()
  const [name, setN] = useState(getName())
  const [ready, setReady] = useState(!!getName())
  useEffect(() => { if (ready) connect(code); document.title = `Room ${code} · Game Night` }, [ready, code])
  // In the room: Back asks before leaving (see guard).
  useEffect(() => { if (s.room) guard(code) }, [!!s.room, code])
  // The screen stays on while in a room (see keepAwake).
  useEffect(() => { if (!ready) return; keepAwake(true); return () => keepAwake(false) }, [ready])
  if (!ready) {
    const ok = () => { const n = name.trim(); if (!n) return toast('Enter your name'); setName(n); setReady(true) }
    return html`<div class="wrap narrow stack"><h1>Join room <span class="code">${code}</span></h1>
      <div class="card stack"><${NameField} value=${name} onInput=${setN} onEnter=${ok} /><button class="primary big" onClick=${ok}>Join</button></div></div>`
  }
  if (s.closed === 'elsewhere') return html`<div class="wrap narrow stack"><p>This room is open in another tab.</p><button class="primary" onClick=${() => location.reload()}>Use it here</button></div>`
  if (s.closed === 'removed') return html`<div class="wrap narrow stack"><p>The host removed you from this room.</p><button onClick=${() => go('/')}>Home</button></div>`
  if (s.closed === 'missing') return html`<div class="wrap narrow stack"><p>Room <b>${code}</b> was not found. Rooms close a day after they were last used.</p><button class="primary" onClick=${() => go('/')}>Make a new one</button></div>`
  if (!s.room) return html`<div class="wrap narrow"><p class="dim">Connecting to ${code}…</p></div>`
  return html`<${Room} />`
}

// ---------- room ----------

function Room() {
  const s = useStore()
  const room = s.room
  const isHost = room.host === s.you
  const [rules, setRules] = useState(null)

  // A room this page just made: pick its game (and start a solo game) once we are its host.
  useEffect(() => {
    if (!pending || pending.code !== room.code || !isHost || room.phase !== 'lobby') return
    const p = pending
    pending = null
    if (p.pick) send({ t: 'pick', id: p.pick })
    if (p.start) send({ t: 'start', id: p.pick })
  }, [room.phase, isHost])

  const leave = async () => { if (await askLeave()) { leaving = true; go('/') } }
  const inGame = room.phase === 'game' && room.inst
  const meta = room.inst ? META[room.inst.id] : null
  return html`<div class=${'room' + (s.chatOpen ? ' chat-on' : '')}>
    <header class="bar">
      <button class="icon" onClick=${leave} aria-label="Leave the room" title="Leave">←</button>
      <button class="code" onClick=${() => { S.invite = true; changed() }} title="Invite friends: share, copy the link or show a QR code">${room.code} <span class="small">invite</span></button>
      ${inGame ? html`<span class="bar-game ell"><${GameIcon} m=${meta} size="small" /> ${meta.name}</span>` : html`<span class="bar-game dim ell">${plural(room.members.filter(m => m.online).length, 'player')} here</span>`}
      ${s.status !== 'open' ? html`<span class="pill warn">reconnecting</span>` : ''}
      ${inGame ? html`<button class="icon rules-btn" id="rules-btn" onClick=${() => setRules(room.inst.id)} aria-label="How to play" title="How to play">?</button>` : ''}
      ${inGame && isHost ? html`<button class="icon" onClick=${async () => (await ask({ title: 'End this game for everyone?', body: 'Everyone goes back to the lobby and nobody gets points for it.', ok: 'End game', cancel: 'Keep playing', danger: true })) && send({ t: 'abort' })} aria-label="End the game" title="End the game">✕</button>` : ''}
      <${ThemeButton} />
      <button class="icon chat-btn" onClick=${toggleChat} aria-label="Chat" title="Chat">💬${s.unread ? html`<i>${s.unread}</i>` : ''}</button>
    </header>
    <div class="room-body">
      <main class="room-main">
        ${room.night && html`<${NightBanner} night=${room.night} isHost=${isHost} />`}
        ${room.phase === 'lobby' && html`<${Lobby} isHost=${isHost} onRules=${setRules} />`}
        ${room.phase === 'game' && room.inst && html`<${GameScreen} key=${room.inst.n} />`}
        ${room.phase === 'results' && room.inst && html`<${Results} isHost=${isHost} />`}
      </main>
      ${s.chatOpen && html`<${Chat} />`}
    </div>
    ${rules && html`<${RulesModal} id=${rules} onClose=${() => setRules(null)} />`}
    ${s.invite && html`<${InviteModal} code=${room.code} onClose=${() => { S.invite = false; changed() }} />`}
    ${inGame && html`<${RulesIntro} key=${room.code + room.inst.n} inst=${room.inst} code=${room.code} />`}
  </div>`
}

/** A game's icon (an SVG made by scripts/build-site.mjs from src/icons.ts). */
export function GameIcon({ m, size }) {
  return html`<span class=${'gicon' + (size ? ' ' + size : '')} dangerouslySetInnerHTML=${{ __html: m?.icon ?? '' }} />`
}

/** Light or dark. The page's head script owns the setting; the icon comes from CSS. */
function ThemeButton() {
  return html`<button class="theme-btn" type="button" onClick=${() => window.toggleTheme?.()} aria-label="Switch between light and dark mode" title="Light or dark"></button>`
}

function toggleChat() {
  S.chatOpen = !S.chatOpen
  S.unread = 0
  changed()
  if (S.chatOpen) setTimeout(() => document.getElementById('chat-in')?.focus(), 50)
}

function RulesModal({ id, onClose }) {
  const m = META[id]
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && onClose()}>
    <div class="card stack modal-card"><div class="row between"><h2 class="with-icon"><${GameIcon} m=${m} />${m.name}</h2><button class="icon" onClick=${onClose} aria-label="Close">✕</button></div>
    <ul class="rules">${m.rules.map(r => html`<li>${r}</li>`)}</ul></div></div>`
}

// ---------- the rules before each game ----------

const INTRO_S = 30
const introClosed = new Set() // games whose rules this page has closed, so a reconnect does not show them again

/**
 * Before every game the rules are up for everyone. Tapping anywhere closes them: they shrink into the ? button at the
 * top, where they can be opened again. The game (and its clock) starts when everyone has closed them, or after 30 s.
 */
function RulesIntro({ inst, code }) {
  const key = code + ':' + inst.n
  const [state, setState] = useState(() => inst.intro && !inst.intro.ready.includes(ME) && !introClosed.has(key) ? 'open' : 'closed')
  const card = useRef()
  useTick(250)
  const close = (tell = true) => {
    if (state !== 'open') return
    introClosed.add(key)
    if (tell && inst.intro) send({ t: 'ready' })
    setState('leaving')
    flyTo(card.current, document.getElementById('rules-btn')).then(() => setState('closed'))
  }
  // The game started while the rules were still up (time ran out): they go the same way.
  useEffect(() => { if (!inst.intro) close(false) }, [!!inst.intro])
  useEffect(() => {
    if (state !== 'open') return
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') close() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [state])
  if (state === 'closed') return null
  const m = META[inst.id]
  const left = inst.intro ? Math.max(0, (inst.intro.until - now()) / 1000) : 0
  return html`<div class=${'modal intro' + (state === 'leaving' ? ' leaving' : '')} onClick=${() => close()} role="dialog" aria-modal="true" aria-labelledby="intro-title">
    <div class="card stack modal-card intro-card" ref=${card}>
      <div class="with-icon"><${GameIcon} m=${m} size="big" /><div><div class="dim small">How to play</div><h2 class="nomargin" id="intro-title">${m.name}</h2></div></div>
      <ul class="rules">${m.rules.map(r => html`<li>${r}</li>`)}</ul>
      <div class="intro-time" aria-hidden="true"><i style=${{ width: `${(left / INTRO_S) * 100}%` }}></i></div>
      <div class="row between wrapgap">
        <span class="dim small">The game starts in ${Math.ceil(left)} s, or when everyone has read this. Your time starts then.</span>
        <button class="primary" onClick=${e => { e.stopPropagation(); close() }}>Got it</button>
      </div>
    </div>
  </div>`
}

/** Shrinks an element into another (the rules into the ? button), then gives the button a nudge. */
function flyTo(el, target) {
  if (!el) return Promise.resolve()
  if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.catch(() => {})
  const a = el.getBoundingClientRect(), b = target.getBoundingClientRect()
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const s = Math.max(0.03, b.width / a.width)
  return el.animate([
    { transform: 'none', opacity: 1, borderRadius: '14px' },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.2}px) scale(.62)`, opacity: 0.95, borderRadius: '22px', offset: 0.35 },
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.35, borderRadius: '50%' },
  ], { duration: 560, easing: 'cubic-bezier(.55,0,.7,.4)', fill: 'forwards' }).finished.then(() => {
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' })
    target.classList.add('hint')
    setTimeout(() => target.classList.remove('hint'), 2600)
  }).catch(() => {})
}

/** The room while the rules are up: who has read them, and how long until the game starts. */
function IntroWait({ inst }) {
  useTick(250)
  const m = META[inst.id]
  const ready = inst.intro.ready
  const online = new Set(S.room.members.filter(x => x.online).map(x => x.id))
  const here = inst.players.filter(id => online.has(id))
  const left = Math.max(0, Math.ceil((inst.intro.until - now()) / 1000))
  return html`<div class="wrap narrow stack intro-wait">
    <div class="center stack"><${GameIcon} m=${m} size="huge" /><h2 class="nomargin">${m.name}</h2>
      <p class="dim">Starting in <b>${left} s</b>, or as soon as everyone has read the rules.</p></div>
    <ul class="ready-list">${here.map(id => html`<li key=${id} class=${ready.includes(id) ? 'ok' : ''}><${Avatar} id=${id} /><span class="grow ell"><${Name} id=${id} /></span><span class="small">${ready.includes(id) ? 'ready' : 'reading…'}</span></li>`)}</ul>
    <p class="dim small center">Need the rules again? They are behind the <b>?</b> at the top.</p>
  </div>`
}

// ---------- lobby ----------

function Lobby({ isHost, onRules }) {
  const room = S.room
  const [tab, setTab] = useState(room.night && room.night.idx === -1 ? 'night' : 'games')
  useEffect(() => { if (room.night && room.night.idx === -1) setTab('night') }, [!!room.night])
  return html`<div class="lobby">
    <aside class="card players-card"><${Players} isHost=${isHost} /></aside>
    <section class="lobby-main">
      <div class="tabs" role="tablist">
        <button role="tab" class=${tab === 'games' ? 'sel' : ''} onClick=${() => setTab('games')}>Pick a game</button>
        <button role="tab" class=${tab === 'night' ? 'sel' : ''} onClick=${() => setTab('night')}>🎲 Game night</button>
      </div>
      ${tab === 'games' ? html`<${Library} isHost=${isHost} onRules=${onRules} />` : html`<${NightSetup} isHost=${isHost} />`}
    </section>
  </div>`
}

function Players({ isHost }) {
  const room = S.room
  const [menu, setMenu] = useState(null)
  const list = room.members.slice().sort((a, b) => b.pts - a.pts || (b.online - a.online))
  const played = room.members.some(m => m.games)
  return html`<div>
    <div class="row between"><h2>Players <span class="dim">${room.members.filter(m => m.online).length}</span></h2>${played ? html`<span class="dim small">room points</span>` : ''}</div>
    <ul class="plist">${list.map(m => html`<li key=${m.id} class=${m.online ? '' : 'off'}>
      <${Avatar} id=${m.id} /><span class="grow ell"><${Name} id=${m.id} />${m.id === room.host ? html` <span title="Host">👑</span>` : ''}${m.online ? '' : html` <span class="dim small">away</span>`}</span>
      ${played ? html`<span class="small dim">${m.wins ? `🏆${m.wins}` : ''}</span><b>${m.pts}</b>` : ''}
      ${isHost && m.id !== ME ? html`<button class="icon small" onClick=${() => setMenu(menu === m.id ? null : m.id)} aria-label=${`Options for ${m.name}`}>⋯</button>` : ''}
      ${menu === m.id ? html`<div class="pmenu"><button onClick=${() => { send({ t: 'host', id: m.id }); setMenu(null) }}>Make host</button><button onClick=${async () => { setMenu(null); if (await ask({ title: `Remove ${m.name}?`, body: 'They are taken out of the room and any game they are in.', ok: 'Remove', danger: true })) send({ t: 'kick', id: m.id }) }}>Remove</button></div>` : ''}
    </li>`)}</ul>
    <div class="invite-box"><div class="small">Invite friends to <b class="code-sm">${room.code}</b></div><${InviteButtons} code=${room.code} /></div>
    <${WatchSwitch} isHost=${isHost} />
    <${PointsHelp} />
    ${room.history.length ? html`<details class="hist"><summary class="small">Played here (${room.history.length})</summary><ul class="small">${room.history.map(h => html`<li><${GameIcon} m=${META[h.id]} size="small" /> ${META[h.id]?.name}: ${h.winners.length ? h.winners.map(nameOf).join(' & ') : html`<span class="dim">no winner</span>`}</li>`)}</ul></details>` : ''}
  </div>`
}

/** Whether people who are not in a game (late arrivals, knocked-out players) can follow it. On unless the host says. */
function WatchSwitch({ isHost }) {
  const on = S.room.watch !== false
  if (!isHost) return on ? '' : html`<p class="dim small">Watching is off: anyone not in a game waits for the next one.</p>`
  return html`<label class="switch-row">
    <span><b class="small">Let people watch</b><span class="dim small">Anyone who arrives mid-game can follow it live and plays from the next game.</span></span>
    <button type="button" role="switch" aria-checked=${on} class=${'switch' + (on ? ' on' : '')} onClick=${() => send({ t: 'watch', on: !on })}><i></i></button>
  </label>`
}

// The same table as src/points.ts, for the lobby's explanation.
const POINTS = [[2, '10 · 0'], [3, '10 · 5 · 0'], [4, '10 · 7 · 3 · 0'], [5, '10 · 7 · 5 · 3 · 0'], [6, '10 · 7 · 5 · 4 · 2 · 0'], ['8+', '10 · 7 · 5 · 4 · 3 · 2 · 1 … 0']]

function PointsHelp() {
  return html`<details class="hist points-help"><summary class="small">How room points work</summary>
    <p class="small">Every game adds to the room's table. A win is worth 10 and last place 0; the places between depend on how many played.</p>
    <table class="tbl small"><tr><th>Players</th><th>Points by place</th></tr>${POINTS.map(([n, row]) => html`<tr key=${n}><td>${n}</td><td>${row}</td></tr>`)}</table>
    <p class="small dim">Level players share their places' points. In team games every winner gets 10. Make no move in a game and you score 0 for it.</p>
  </details>`
}

function Library({ isHost, onRules }) {
  const room = S.room
  const n = room.members.filter(m => m.online).length
  const [fit, setFit] = useState(true)
  const [mood, setMood] = useState(null)
  const list = CATALOG.filter(m => (!fit || (n >= m.min && n <= m.max)) && (!mood || m.moods.includes(mood)))
  const pick = META[room.pick] ?? CATALOG[0]
  return html`<div class="stack">
    <${GameDetail} meta=${pick} isHost=${isHost} n=${n} onRules=${onRules} />
    <div class="row between wrapgap"><div class="chips">
      <button class=${'chipbtn' + (fit ? ' sel' : '')} onClick=${() => setFit(!fit)}>Fits ${n} ${n === 1 ? 'player' : 'players'}</button>
      ${Object.entries(MOODS).map(([k, label]) => html`<button key=${k} class=${'chipbtn' + (mood === k ? ' sel' : '')} onClick=${() => setMood(mood === k ? null : k)}>${label}</button>`)}
    </div></div>
    <div class="lib small-cards">${list.map(m => html`<button key=${m.id} class=${'gcard pick' + (m.id === pick.id ? ' sel' : '')} disabled=${!isHost && m.id !== pick.id} onClick=${() => isHost && send({ t: 'pick', id: m.id })}>
      <div class="gc-top"><${GameIcon} m=${m} /><div><b>${m.name}</b><div class="dim small">${players(m)} · ~${estMinutes(m, Math.max(n, m.min))} min</div></div></div>
      <p class="small">${m.blurb}</p></button>`)}
      ${!list.length ? html`<p class="dim">No game fits these filters.</p>` : ''}</div>
    ${!isHost ? html`<p class="dim small">The host picks the game. You can browse the rules meanwhile.</p>` : ''}
  </div>`
}

function DnaBars({ dna }) {
  return html`<div class="dna">${DNA.map(([k, label]) => html`<div key=${k}><span class="small dim">${label}</span><span class="dots">${[1, 2, 3, 4, 5].map(i => html`<i class=${i <= dna[k] ? 'on' : ''}></i>`)}</span></div>`)}</div>`
}

function GameDetail({ meta, isHost, n, onRules }) {
  const room = S.room
  const cfg = room.configs[meta.id] ?? {}
  const val = o => cfg[o.key] ?? o.def
  const set = (k, v) => send({ t: 'config', id: meta.id, config: { ...cfg, [k]: v } })
  const fits = n >= meta.min && n <= meta.max
  return html`<div class="card detail">
    <div class="row between"><div class="gc-top"><${GameIcon} m=${meta} size="big" /><div><h2 class="nomargin">${meta.name}</h2><div class="dim small">${players(meta)} players · about ${estMinutes(meta, Math.max(n, meta.min))} min · ${meta.cat}</div></div></div>
      <button class="link" onClick=${() => onRules(meta.id)}>How to play</button></div>
    <p>${meta.blurb}</p>
    <${DnaBars} dna=${meta.dna} />
    <div class="opts">${meta.options.map(o => html`<label key=${o.key} class="opt"><span>${o.label}</span>
      ${o.kind === 'choice'
        ? html`<select disabled=${!isHost} value=${String(val(o))} onChange=${e => set(o.key, e.target.value)}>${o.choices.map(([v, l]) => html`<option value=${String(v)}>${l}</option>`)}</select>`
        : html`<span class="num"><input type="number" inputmode="numeric" disabled=${!isHost} min=${o.min} max=${o.max} value=${val(o)} onChange=${e => set(o.key, Number(e.target.value))} />${o.unit ? html`<span class="dim small">${o.unit === 's' ? 'sec' : o.unit}</span>` : ''}</span>`}
    </label>`)}</div>
    ${isHost
      ? html`<button class="primary big wide" disabled=${!fits} onClick=${() => send({ t: 'start', id: meta.id })}>${fits ? `Start ${meta.name}` : n < meta.min ? `Needs ${meta.min}+ players (${n} here)` : `Up to ${meta.max} players`}</button>`
      : html`<p class="dim center">Waiting for the host to start…</p>`}
  </div>`
}

// ---------- game nights ----------

function NightSetup({ isHost }) {
  const room = S.room
  const night = room.night
  const n = room.members.filter(m => m.online).length
  const [length, setLength] = useState(night?.length ?? 'standard')
  const [moods, setMoods] = useState(night?.moods ?? [])
  const toggle = k => setMoods(moods.includes(k) ? moods.filter(x => x !== k) : [...moods, k].slice(-4))
  const planned = night && night.idx === -1
  const total = night ? night.plan.reduce((a, id) => a + estMinutes(META[id], n), 0) : 0
  return html`<div class="stack">
    <div class="card stack">
      <h2 class="nomargin">Plan a game night</h2>
      <p class="dim small">Pick how long and what kind of fun. The games are chosen for ${plural(n, 'player')}, with one leaderboard across all of them.</p>
      <div class="lengths">${LENGTHS.map(([k, label, sub]) => html`<button key=${k} class=${'len' + (length === k ? ' sel' : '')} disabled=${!isHost} onClick=${() => setLength(k)}><b>${label}</b><span class="small dim">${sub}</span></button>`)}</div>
      ${length === 'tournament' ? html`<p class="small dim">Tournament: after each game the bottom of the table is knocked out. The last two play the final.</p>` : ''}
      <div><div class="small dim">How are you feeling? (up to 4)</div><div class="chips">${Object.entries(MOODS).map(([k, label]) => html`<button key=${k} class=${'chipbtn' + (moods.includes(k) ? ' sel' : '')} disabled=${!isHost} onClick=${() => toggle(k)}>${label}</button>`)}</div></div>
      ${isHost ? html`<button class=${planned ? '' : 'primary'} onClick=${() => send({ t: 'night', length, moods })}>${planned ? 'Plan again' : 'Plan the night'}</button>` : html`<p class="dim small">The host plans the night.</p>`}
    </div>
    ${planned && html`<div class="card stack">
      <div class="row between"><h2 class="nomargin">Tonight's games</h2><span class="dim small">${night.length === 'endless' ? 'keeps going' : `about ${total} min`}</span></div>
      <ol class="plan">${night.plan.map((id, i) => html`<li key=${i}><${GameIcon} m=${META[id]} /><span class="grow"><b>${META[id].name}</b><span class="dim small"> · ~${estMinutes(META[id], n)} min${night.length === 'tournament' && i === night.plan.length - 1 ? ' · final' : ''}</span></span>
        ${isHost ? html`<button class="link" onClick=${() => send({ t: 'nightSwap', i })}>swap</button>${night.length !== 'tournament' && night.plan.length > 1 ? html`<button class="link" onClick=${() => send({ t: 'nightDrop', i })}>remove</button>` : ''}` : ''}</li>`)}</ol>
      ${isHost ? html`<div class="row"><button class="primary big grow" onClick=${() => send({ t: 'nightGo' })}>Start the night</button><button onClick=${() => send({ t: 'nightEnd' })}>Cancel</button></div>` : html`<p class="dim center">Waiting for the host to start the night…</p>`}
    </div>`}
  </div>`
}

function NightBanner({ night, isHost }) {
  if (night.idx < 0) return null
  const room = S.room
  const label = LENGTHS.find(l => l[0] === night.length)?.[1]
  const out = night.length === 'tournament' ? room.members.filter(m => night.alive.length && !night.alive.includes(m.id)).map(m => m.id) : []
  return html`<div class="night-banner">
    <span>🎲 <b>${label} night</b> · game ${Math.min(night.idx + 1, night.plan.length)} of ${night.length === 'endless' ? '∞' : night.plan.length}</span>
    <span class="plan-mini">${night.plan.map((id, i) => html`<span key=${i} class=${i < night.idx ? 'past' : i === night.idx ? 'now' : ''} title=${META[id].name}><${GameIcon} m=${META[id]} size="small" /></span>`)}</span>
    ${out.includes(ME) ? html`<span class="pill">knocked out: watching</span>` : ''}
  </div>`
}

export function NightTable({ night }) {
  const ids = Object.keys(night.points).sort((a, b) => night.points[b] - night.points[a])
  const last = night.rounds[night.rounds.length - 1]
  let place = 0
  return html`<div class="card"><h2>Game night table</h2><table class="tbl">
    <tr><th>#</th><th>Player</th>${night.rounds.map(r => html`<th title=${META[r.id].name}><${GameIcon} m=${META[r.id]} size="small" /></th>`)}<th>Total</th></tr>
    ${ids.map((id, i) => {
      if (i === 0 || night.points[id] !== night.points[ids[i - 1]]) place = i + 1
      const out = night.length === 'tournament' && !night.alive.includes(id)
      return html`<tr key=${id} class=${(id === ME ? 'me' : '') + (out ? ' out' : '')}><td>${place}</td><td><${Name} id=${id} />${last?.out.includes(id) ? html` <span class="pill warn">out</span>` : ''}</td>${night.rounds.map(r => html`<td class="dim">${r.points[id] ?? '–'}</td>`)}<td><b>${night.points[id]}</b></td></tr>`
    })}
  </table></div>`
}

// ---------- playing ----------

export const mods = {}

// The height left above a phone keyboard. Android shrinks the page for the keyboard, iOS lays it over the page; the
// visual viewport is right on both.
if (window.visualViewport) {
  const vv = window.visualViewport
  const set = () => document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
  vv.addEventListener('resize', set)
  set()
}

/** Typing an answer under a drawing on a phone: bring the drawing up so it shows above the keyboard with the box. */
function useTypingUnderDrawing(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const on = e => {
      if (!e.target.matches?.('.answer input') || !el.querySelector('.canvas') || !matchMedia('(max-width: 860px)').matches) return
      // After the keyboard is up (it takes a moment to slide in).
      setTimeout(() => (el.querySelector('.hint') ?? el.querySelector('.canvas'))?.scrollIntoView({ block: 'start', behavior: 'instant' }), 320)
    }
    el.addEventListener('focusin', on)
    return () => el.removeEventListener('focusin', on)
  })
}

function GameScreen() {
  const s = useStore()
  const inst = s.room.inst
  const area = useRef()
  useTypingUnderDrawing(area)
  const [mod, setMod] = useState(mods[inst.id] ?? null)
  useEffect(() => {
    if (mods[inst.id]) return setMod(mods[inst.id])
    import(`./games/${inst.id}.js`).then(m => { mods[inst.id] = m; setMod(m) }).catch(() => toast('Could not load the game. Refresh the page.'))
  }, [inst.id])
  if (inst.intro) return html`<${IntroWait} inst=${inst} />`
  const seated = inst.players.includes(ME)
  if (!seated && !s.room.watch) return html`<${NoWatching} inst=${inst} />`
  if (!mod || !s.game) return html`<div class="wrap"><p class="dim">Loading…</p></div>`
  const Game = mod.default
  return html`<div class=${'game-area g-' + inst.id} ref=${area}>
    ${!seated ? html`<div class="watch">You are watching this game. You will be in the next one.</div>` : ''}
    <${Game} v=${s.game} inst=${inst} seated=${seated} />
  </div>`
}

/** Not in this game, and the host has turned watching off: who is playing, and that the next game is theirs. */
function NoWatching({ inst }) {
  const m = META[inst.id]
  return html`<div class="wrap narrow stack intro-wait">
    <div class="center stack"><${GameIcon} m=${m} size="huge" /><h2 class="nomargin">${m.name} is on</h2>
      <p class="dim">The host has turned off watching, so the game is hidden. You will be in the next one.</p></div>
    <ul class="ready-list">${inst.players.map(id => html`<li key=${id}><${Avatar} id=${id} /><span class="grow ell"><${Name} id=${id} /></span><span class="small dim">playing</span></li>`)}</ul>
  </div>`
}

// ---------- inviting ----------

const roomLink = code => `${location.origin}/r/${code}`
const shareRoom = code => share(`Join my game night room ${code}`, roomLink(code))
const copyRoom = code => { track('share', { method: 'copy' }); return copy(roomLink(code), 'Room link copied') }
const openQr = () => { S.invite = true; changed() }

/** Share, Copy link and QR code: three ways to get the room link to someone. */
function InviteButtons({ code }) {
  return html`<div class="invite-btns">
    <button type="button" onClick=${() => shareRoom(code)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Share</button>
    <button type="button" onClick=${() => copyRoom(code)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>Copy link</button>
    <button type="button" onClick=${openQr}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>QR code</button>
  </div>`
}

/** The room's QR code (the camera app opens the room), its code in big letters and its link. */
function InviteModal({ code, onClose }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    track('share', { method: 'qr' })
    import('./qr.js').then(({ default: qrcode }) => {
      const q = qrcode(0, 'M')
      q.addData(roomLink(code))
      q.make()
      const n = q.getModuleCount(), pad = 4
      let d = ''
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + pad} ${y + pad}h1v1h-1z`
      setSvg(`<svg viewBox="0 0 ${n + pad * 2} ${n + pad * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code for the room link"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`)
    }, () => setSvg(''))
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [code])
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="inv-title">
    <div class="card stack modal-card invite-card">
      <div class="row between"><h2 class="nomargin" id="inv-title">Invite friends</h2><button class="icon" onClick=${onClose} aria-label="Close">✕</button></div>
      <div class="inv-body">
        <div class="stack inv-qr"><div class="qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>
          <p class="dim small center nomargin">Point a phone camera at this to join.</p></div>
        <div class="stack inv-info">
          <div class="center"><div class="dim small">Room code</div><div class="code big-code">${code}</div></div>
          <button type="button" class="link-line" onClick=${() => copyRoom(code)} title="Copy the link">${roomLink(code).replace(/^https?:\/\//, '')}</button>
          <div class="invite-btns">
            <button type="button" class="primary" onClick=${() => shareRoom(code)}>Share</button>
            <button type="button" onClick=${() => copyRoom(code)}>Copy link</button>
          </div>
        </div>
      </div>
    </div>
  </div>`
}

// ---------- results ----------

// ---------- feedback ----------

const FB_KEY = 'gn.fb'
const fbDone = () => { try { return JSON.parse(localStorage.getItem(FB_KEY) ?? '[]') } catch { return [] } }

/** After a game: stars, would you play it again, and an optional line (something to fix, or a game to add). */
export function Feedback({ inst, code }) {
  const key = code + ':' + inst.n
  const [rating, setRating] = useState(0)
  const [again, setAgain] = useState(null)
  const [kind, setKind] = useState('fix')
  const [text, setText] = useState('')
  const [sent, setSent] = useState(() => fbDone().includes(key))
  const m = META[inst.id]
  if (sent) return null
  const submit = () => {
    send({ t: 'fb', rating: rating || undefined, again: again ?? undefined, kind, text: text.trim() })
    try { localStorage.setItem(FB_KEY, JSON.stringify([...fbDone(), key].slice(-40))) } catch { /* private mode */ }
    setSent(true)
    toast('Thanks! That helps.')
  }
  return html`<div class="card stack fb">
    <div class="row between wrapgap"><b>How was ${m.name}?</b>
      <span class="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(i => html`<button key=${i} type="button" role="radio" aria-checked=${rating === i} aria-label=${`${i} star${i > 1 ? 's' : ''}`} class=${i <= rating ? 'on' : ''} onClick=${() => setRating(i)}>★</button>`)}</span></div>
    ${rating ? html`<div class="row wrapgap"><span class="small">Would you play it again?</span>
      <button type="button" class=${'chipbtn' + (again === true ? ' sel' : '')} onClick=${() => setAgain(true)}>Yes</button>
      <button type="button" class=${'chipbtn' + (again === false ? ' sel' : '')} onClick=${() => setAgain(false)}>No</button></div>
    <div class="row wrapgap"><span class="chips">
      <button type="button" class=${'chipbtn' + (kind === 'fix' ? ' sel' : '')} onClick=${() => setKind('fix')}>Something to fix</button>
      <button type="button" class=${'chipbtn' + (kind === 'idea' ? ' sel' : '')} onClick=${() => setKind('idea')}>A game you want</button></span></div>
    <div class="row"><input class="grow" maxlength="300" value=${text} onInput=${e => setText(e.target.value)} onKeyDown=${e => e.key === 'Enter' && submit()} placeholder=${kind === 'fix' ? 'What went wrong or felt off? (optional)' : 'Which game should we add? (optional)'} aria-label="Feedback" />
      <button class="primary" onClick=${submit}>Send</button></div>` : ''}
  </div>`
}

// ---------- chat ----------

function Chat() {
  const s = useStore()
  const box = useRef()
  const [v, setV] = useState('')
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [s.chat.length])
  const submit = e => { e.preventDefault(); const t = v.trim(); if (!t) return; send({ t: 'chat', text: t }); setV('') }
  return html`<aside class="chat">
    <div class="row between chat-head"><b>Chat</b><button class="icon" onClick=${toggleChat} aria-label="Close chat">✕</button></div>
    <div class="chat-list" ref=${box}>${s.chat.length ? s.chat.map((c, i) => html`<div key=${i} class="msg"><${Name} id=${c.id} you=${false} /> ${c.text}</div>`) : html`<p class="dim small">Say hi. Chat is handy for Imposter and Code Words discussions.</p>`}</div>
    <form class="answer" onSubmit=${submit}><input id="chat-in" value=${v} onInput=${e => setV(e.target.value)} maxlength="200" placeholder="Message" autocomplete="off" aria-label="Chat message" /><button>Send</button></form>
  </aside>`
}

render(html`<${App} />`, document.getElementById('app'))
countView()
