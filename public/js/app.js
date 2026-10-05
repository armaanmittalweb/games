// Game Night: the page around the games. Home, rooms, the library, game nights, results and chat.
import { html, render, useState, useEffect, useRef } from './preact.js'
import { S, ME, connect, disconnect, send, subscribe, changed, toast, share, getName, setName, now } from './core.js'
import { Avatar, Name, nameOf, plural, useTick } from './ui.js'
import { pageView } from './track.js'
import { CATALOG } from '/catalog.js'

const META = Object.fromEntries(CATALOG.map(m => [m.id, m]))
const MOODS = { think: '🧠 Think', chaos: '😂 Chaos', competitive: '🎯 Competitive', deception: '🕵️ Deception', creative: '🎨 Creative', fast: '⚡ Fast', social: '🗣️ Social', strategic: '♟️ Strategic' }
const LENGTHS = [['quick', 'Quick', '15 min'], ['standard', 'Standard', '30 min'], ['chaos', 'Chaos', '45 min'], ['tournament', 'Tournament', 'knockout'], ['endless', 'Endless', '∞']]
const CATS = ['Word', 'Drawing', 'Party', 'Deception', 'Trivia', 'Puzzle', 'Strategy', 'Cards & dice', 'Reflex']
const DNA = [['skill', 'Skill'], ['luck', 'Luck'], ['social', 'Social'], ['brain', 'Brain'], ['chaos', 'Chaos'], ['replay', 'Replay']]
const placePoints = p => [10, 7, 5, 4, 3, 2, 1][p - 1] ?? 1
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

// ---------- app ----------

function App() {
  const [where, setWhere] = useState(route())
  useEffect(() => {
    const on = () => setWhere(route())
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
    const c = code.trim().toUpperCase()
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
        <div class="row"><input class="grow code-in" value=${code} onInput=${e => setCode(e.target.value)} onKeyDown=${e => e.key === 'Enter' && join()} maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off" aria-label="Room code" /><button onClick=${join}>Join</button></div>
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

  const leave = () => { if (room.phase === 'game' && !confirm('Leave the room?')) return; go('/') }
  const inGame = room.phase === 'game' && room.inst
  const meta = room.inst ? META[room.inst.id] : null
  return html`<div class=${'room' + (s.chatOpen ? ' chat-on' : '')}>
    <header class="bar">
      <button class="icon" onClick=${leave} aria-label="Leave the room" title="Leave">←</button>
      <button class="code" onClick=${() => share(`Join my game night room ${room.code}`, `${location.origin}/r/${room.code}`)} title="Share the room link">${room.code} <span class="small">share</span></button>
      ${inGame ? html`<span class="bar-game ell"><${GameIcon} m=${meta} size="small" /> ${meta.name}</span>` : html`<span class="bar-game dim ell">${plural(room.members.filter(m => m.online).length, 'player')} here</span>`}
      ${s.status !== 'open' ? html`<span class="pill warn">reconnecting</span>` : ''}
      ${inGame ? html`<button class="icon rules-btn" id="rules-btn" onClick=${() => setRules(room.inst.id)} aria-label="How to play" title="How to play">?</button>` : ''}
      ${inGame && isHost ? html`<button class="icon" onClick=${() => confirm('End this game for everyone? No points are given.') && send({ t: 'abort' })} aria-label="End the game" title="End the game">✕</button>` : ''}
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
      ${menu === m.id ? html`<div class="pmenu"><button onClick=${() => { send({ t: 'host', id: m.id }); setMenu(null) }}>Make host</button><button onClick=${() => { if (confirm(`Remove ${m.name}?`)) send({ t: 'kick', id: m.id }); setMenu(null) }}>Remove</button></div>` : ''}
    </li>`)}</ul>
    <p class="dim small">Share the code <b class="code-sm">${room.code}</b> or tap it at the top. Room points: 10 for a win, then 7, 5, 4, 3, 2, 1.</p>
    ${room.history.length ? html`<details class="hist"><summary class="small">Played here (${room.history.length})</summary><ul class="small">${room.history.map(h => html`<li><${GameIcon} m=${META[h.id]} size="small" /> ${META[h.id]?.name}: ${h.winners.map(nameOf).join(' & ')}</li>`)}</ul></details>` : ''}
  </div>`
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

function NightTable({ night }) {
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

const mods = {}
function GameScreen() {
  const s = useStore()
  const inst = s.room.inst
  const [mod, setMod] = useState(mods[inst.id] ?? null)
  useEffect(() => {
    if (mods[inst.id]) return setMod(mods[inst.id])
    import(`./games/${inst.id}.js`).then(m => { mods[inst.id] = m; setMod(m) }).catch(() => toast('Could not load the game. Refresh the page.'))
  }, [inst.id])
  if (inst.intro) return html`<${IntroWait} inst=${inst} />`
  if (!mod || !s.game) return html`<div class="wrap"><p class="dim">Loading…</p></div>`
  const seated = inst.players.includes(ME)
  const Game = mod.default
  return html`<div class=${'game-area g-' + inst.id}>
    ${!seated ? html`<div class="watch">You are watching this game. You will be in the next one.</div>` : ''}
    <${Game} v=${s.game} inst=${inst} seated=${seated} />
  </div>`
}

// ---------- results ----------

function Results({ isHost }) {
  const s = useStore()
  const room = s.room
  const inst = room.inst
  const meta = META[inst.id]
  const night = room.night && inst.night ? room.night : null
  const st = inst.standings ?? []
  const [mod, setMod] = useState(mods[inst.id] ?? null)
  useEffect(() => { if (!mods[inst.id]) import(`./games/${inst.id}.js`).then(m => { mods[inst.id] = m; setMod(m) }) }, [inst.id])
  const winners = st.filter(x => x.place === 1).map(x => x.id)
  const next = night && !night.done ? night.plan[night.idx + 1] ?? (night.length === 'endless' ? 'more' : null) : null
  const Summary = mod?.Summary
  const champs = night?.done ? night.champions : []
  return html`<div class="wrap results stack">
    ${night?.done ? html`<div class="card champion"><div class="trophy">🏆</div><h1>${champs.map(nameOf).join(' & ')} ${champs.length > 1 ? 'share' : 'wins'} the night!</h1><p class="dim">${night.rounds.length} games played</p></div>` : ''}
    <div class="card">
      <div class="row between"><h2 class="nomargin with-icon"><${GameIcon} m=${meta} />${meta.name}</h2><span class="dim small">${winners.length ? `${winners.map(nameOf).join(' & ')} ${winners.length > 1 ? 'tie' : 'wins'}` : ''}</span></div>
      <div class="podium">${[2, 1, 3].map(p => {
        const at = st.filter(x => x.place === p)
        return at.length ? html`<div class=${'pod p' + p}><div class="pod-names">${at.map(x => html`<div key=${x.id}><${Avatar} id=${x.id} size=${p === 1 ? 44 : 34} /><div class="ell"><${Name} id=${x.id} /></div></div>`)}</div><div class="pod-block">${p}</div></div>` : html`<div class=${'pod p' + p + ' empty'}></div>`
      })}</div>
      <table class="tbl"><tr><th>#</th><th>Player</th><th>Score</th><th></th><th title="Room points">+pts</th></tr>
        ${st.map(x => html`<tr key=${x.id} class=${x.id === ME ? 'me' : ''}><td>${x.place}</td><td><${Name} id=${x.id} /></td><td><b>${x.score}</b></td><td class="dim small">${x.detail ?? ''}</td><td class="plus">+${placePoints(x.place)}</td></tr>`)}
      </table>
    </div>
    ${Summary && html`<${Summary} inst=${inst} summary=${inst.summary} />`}
    ${inst.players.includes(ME) && html`<${Feedback} key=${room.code + inst.n} inst=${inst} code=${room.code} />`}
    ${night && html`<${NightTable} night=${night} />`}
    ${isHost ? html`<div class="row wrapgap">
      ${night && !night.done && next ? html`<button class="primary big grow" onClick=${() => send({ t: 'nightGo' })}>Next: ${next === 'more' ? 'a new game' : META[next].name}</button>` : ''}
      ${night && !night.done ? html`<button onClick=${() => confirm('End the game night now?') && send({ t: 'nightEnd' })}>End the night</button>` : ''}
      ${night?.done ? html`<button class="primary big grow" onClick=${() => send({ t: 'nightEnd' })}>Back to the lobby</button>` : ''}
      ${!night ? html`<button class="primary big grow" onClick=${() => send({ t: 'start', id: inst.id })}>Play again</button><button onClick=${() => send({ t: 'lobby' })}>Choose another game</button>` : ''}
    </div>` : html`<p class="dim center">${night && !night.done ? `Up next: ${next && next !== 'more' ? META[next].name : 'another game'}. Waiting for the host…` : 'Waiting for the host…'}</p>`}
  </div>`
}

// ---------- feedback ----------

const FB_KEY = 'gn.fb'
const fbDone = () => { try { return JSON.parse(localStorage.getItem(FB_KEY) ?? '[]') } catch { return [] } }

/** After a game: stars, would you play it again, and an optional line (something to fix, or a game to add). */
function Feedback({ inst, code }) {
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
