// Game Night: the page around the games. Home, rooms, the library, game nights, results and chat.
import { html, render, useState, useEffect, useRef } from './preact.js'
import { S, ME, connect, disconnect, send, subscribe, changed, toast, share, copy, codeFrom, keepAwake, getName, setName, now, onEvent, local } from './core.js'
import { Avatar, Name, nameOf, plural, useTick, useFocusTrap, Plus } from './ui.js'
import { STICKERS, STICKER, Sticker } from './stickers.js'
import { pageView, track } from './track.js'
import { ask, dismiss, dialogOpen } from './dialog.js'
import { Results } from './results.js'
import { CATALOG, KINDS } from '/catalog.js'

export const META = Object.fromEntries(CATALOG.map(m => [m.id, m]))
const MOODS = { think: 'Think', chaos: 'Chaos', competitive: 'Competitive', deception: 'Deception', creative: 'Creative', fast: 'Fast', social: 'Social', strategic: 'Strategic' }
const LENGTHS = [['quick', 'Quick', '15 min'], ['standard', 'Standard', '30 min'], ['chaos', 'Chaos', '45 min'], ['tournament', 'Tournament', 'knockout'], ['endless', 'Endless', 'keeps going']]
const CATS = ['Word', 'Drawing', 'Party', 'Deception', 'Trivia', 'Puzzle', 'Strategy', 'Cards', 'Reflex']
const DNA = [['skill', 'Skill'], ['luck', 'Luck'], ['social', 'Social'], ['brain', 'Brain'], ['chaos', 'Chaos'], ['replay', 'Replay']]
const estMinutes = (m, n) => Math.round(m.minutes[0] + m.minutes[1] * n)
const players = (m) => m.min === m.max ? `${m.min}` : `${m.min}–${m.max}`
/** Guests see the host's controls as they are; touching one says only the host can change it. */
const hostOnly = what => () => toast(`Only the host can ${what}`)

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
  const tv = location.pathname.match(/^\/tv(?:\/([A-Za-z0-9]{5}))?\/?$/)
  document.body.dataset.view = m ? 'room' : tv ? 'tv' : 'home'
  if (m) return { room: m[1].toUpperCase() }
  if (tv) return { tv: (tv[1] ?? '').toUpperCase() }
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
  if (where.tv !== undefined) return html`<${TvGate} code=${where.tv} />`
  return where.room ? html`<${RoomGate} code=${where.room} />` : html`<${Home} />`
}

function NameField({ value, onInput, onEnter }) {
  return html`<label class="name-row" for="name"><span>Your name</span>
    <input id="name" maxlength="16" autocomplete="nickname" placeholder="e.g. Armaan" defaultValue=${value} onInput=${e => onInput(e.target.value)} onKeyDown=${e => e.key === 'Enter' && onEnter?.()} /></label>`
}

/** The site's top bar, as on every other page. */
function SiteNav() {
  return html`<header class="site-nav"><div class="sn">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"><i></i><i></i></span>Game Night</a>
    <nav aria-label="Main"><a href="/games">All games</a><${ThemeButton} /></nav></div></header>`
}

/** A game as a big card in its kind's colour (the three beside the welcome). */
function KindCard({ id, cls }) {
  const m = META[id], [bg, ink] = KINDS[m.cat]
  return html`<div class=${'kcard ' + cls} data-id=${id} style=${`--k:${bg};--ink:${ink}`}><small>${m.cat}</small><${GameIcon} m=${m} /><b>${m.name}</b></div>`
}

// The order the welcome's cards go through every game. It opens on Word Race, Draw & Guess and Mind Meld (left to
// right, as the page is built). After that each card comes from the kind with the most games left that is not the
// kind just shown, so cards side by side differ in colour, all the way round.
const DECK = (() => {
  const deck = ['mindmeld', 'draw', 'wordle']
  const left = CATS.map(c => CATALOG.filter(m => m.cat === c && !deck.includes(m.id)).map(m => m.id))
  let last = META.wordle.cat
  for (;;) {
    const l = left.filter(l => l.length && META[l[0]].cat !== last).sort((a, b) => b.length - a.length)[0] ?? left.find(l => l.length)
    if (!l) return deck
    last = META[l[0]].cat
    deck.push(l.shift())
  }
})()

const TURN_MS = 1800
/** After someone flips the cards themselves, they stay put this long before turning on their own again. */
const HOLD_MS = 4000
/** Wheel travel (px) for one card, the shortest gap between two (so a flick of a trackpad does not fly past ten), and the swipe distance for one card. */
const WHEEL_PX = 40, WHEEL_GAP_MS = 170, SWIPE_PX = 56

/**
 * Three cards from DECK, a window moving one game at a time: ABC, then DAB, then EDA, and round to ABC again. A card
 * keeps its element as it moves from slot to slot, so CSS moves it. One more waits unseen on the left to rise in,
 * and the one that just left stays a turn while it slides off, so a turn backwards slides it straight back.
 *
 * They are also a way in: pointing at them stops the turning, the wheel or a sideways swipe flips through them, and a
 * click or tap on one makes a room with that game. The list below does the same for keyboards and screen readers,
 * so the cards stay hidden from them.
 */
function HeroCards({ onPick }) {
  const [k, setK] = useState(0)
  const art = useRef(null)
  // over: a mouse is on the cards; armed: it has moved there (not just had the page scroll under it); drag: a press.
  const live = useRef({ over: false, armed: false, drag: null, next: Date.now() + TURN_MS, acc: 0, gap: 0 })
  const flip = d => { live.current.next = Date.now() + HOLD_MS; setK(x => x + d) }
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      const L = live.current, now = Date.now()
      if (document.hidden || L.over || L.drag) L.next = Math.max(L.next, now + TURN_MS)
      else if (now >= L.next) { L.next = now + TURN_MS; setK(x => x + 1) }
    }, 100)
    return () => clearInterval(t)
  }, [])
  // The wheel turns the cards only once the mouse has moved onto them, so scrolling the page past them still scrolls.
  useEffect(() => {
    const el = art.current
    const wheel = e => {
      const L = live.current
      if (!L.armed) return
      e.preventDefault()
      const now = Date.now()
      if (now < L.gap) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY
      L.acc += e.deltaMode ? d * 40 : d
      if (Math.abs(L.acc) >= WHEEL_PX) { flip(Math.sign(L.acc)); L.acc = 0; L.gap = now + WHEEL_GAP_MS }
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const L = live.current
  const down = e => {
    if (e.button) return
    L.drag = { x: e.clientX, moved: false, card: e.target.closest('.kcard:is(.s-left, .s-mid, .s-right)')?.dataset.id }
    if (e.pointerType === 'mouse') art.current.setPointerCapture(e.pointerId)
  }
  const move = e => {
    if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) L.armed = true
    const d = L.drag
    if (!d) return
    const dx = e.clientX - d.x
    // The cards follow the finger: drag right and they move right (the next game rises in on the left).
    if (Math.abs(dx) >= SWIPE_PX) { flip(dx > 0 ? 1 : -1); d.x = e.clientX; d.moved = true }
  }
  const up = () => { const d = L.drag; L.drag = null; if (d && !d.moved && d.card) onPick(d.card) }
  const at = i => DECK[((i % DECK.length) + DECK.length) % DECK.length]
  return html`<div class="hero-art" aria-hidden="true" ref=${art}
    onPointerEnter=${e => { if (e.pointerType === 'mouse') L.over = true }} onPointerLeave=${() => { L.over = L.armed = false; L.acc = 0 }}
    onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${() => { L.drag = null }}>
    ${[[k + 3, 'in'], [k + 2, 'left'], [k + 1, 'mid'], [k, 'right'], [k - 1, 'out']]
      .map(([i, slot]) => html`<${KindCard} key=${at(i)} id=${at(i)} cls=${'s-' + slot} />`)}
    <span class="hero-hint">Scroll to flip through · click one to play</span></div>`
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
  // The code box shows capitals through CSS and is never rewritten while a word is being typed (that is what made
  // letters come out backwards on Android). A pasted link or invite message becomes just the code.
  const onCode = e => {
    const t = e.target.value
    if (!e.isComposing && (/[/\s]/.test(t.trim()) || t.length > 5)) { const c = codeFrom(t); if (c && c !== t) e.target.value = c }
    setCode(e.target.value)
  }
  const join = () => {
    const c = codeFrom(code)
    if (!need()) return
    if (!/^[A-Z0-9]{5}$/.test(c)) return toast('Room codes are 5 characters')
    go('/r/' + c)
  }
  const list = CATALOG.filter(m => cat === 'All' || m.cat === cat)
  return html`<${SiteNav} />
  <div class="wrap home">
    <section class="hero">
      <div class="hero-text">
        <h1>Play together, each on your own phone</h1>
        <div class="hero-card start">
          <div class="start-head"><h2>Start playing</h2><p>Type your name and make a room. You get a code to send your friends.</p></div>
          <${NameField} value=${name} onInput=${setN} onEnter=${() => make(null)} />
          <button class="primary big" disabled=${busy} onClick=${() => make(null)}>Create a room</button>
          <div class="or" role="separator"><span>Got a code from a friend?</span></div>
          <div class="join-row"><input class="code-in" maxlength="200" onInput=${onCode} onKeyDown=${e => e.key === 'Enter' && join()} placeholder="Room code or link" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Room code, or paste the room link" /><button class="tint" onClick=${join}>Join</button></div>
          <ul class="start-facts"><li>Free</li><li>No sign-up</li><li>No app needed</li></ul>
        </div>
      </div>
      <${HeroCards} onPick=${id => !busy && make(id)} />

    </section>
    <section class="games-sec">
      <div class="sec-head"><h2>Games</h2><a href="/games">Rules for every game</a></div>
      <p class="sec-lead">${CATALOG.length} party games for 2 to 30 people. Tap one to make a room with it ready to play.</p>
      <div class="chips scroller" role="group" aria-label="Kind of game">${['All', ...CATS].map(c => html`<button key=${c} class=${'chipbtn' + (cat === c ? ' sel' : '')} aria-pressed=${cat === c} onClick=${() => setCat(c)}><i class="kdot" style=${`--k:${c === 'All' ? 'var(--text)' : KINDS[c][0]}`}></i>${c}</button>`)}</div>
      <ul class="lib">${list.map(m => html`<li key=${m.id}><button class="gcard" disabled=${busy} onClick=${() => make(m.id)}>
        <span class="gc-top"><${GameIcon} m=${m} /><span><b class="gc-name">${m.name}</b><span class="gc-meta">${players(m)} players</span></span></span>
        <span class="gc-blurb">${m.blurb}</span></button></li>`)}</ul>
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
    return html`<${SiteNav} /><main class="gate">
      <div class="gate-art" aria-hidden="true"><i></i><i></i><span>${ICONS.people}</span></div>
      <span class="gate-sub">You're invited to room</span>
      <span class="gate-code code">${code}</span>
      <p class="lead">Party games you play together, each on your own phone.</p>
      <div class="hero-card"><${NameField} value=${name} onInput=${setN} onEnter=${ok} /><button class="primary big" onClick=${ok}>Join the room</button></div>
      <p class="gate-foot">Free. No sign-up, no app. Only people in this room see your name. <a href="/privacy">Privacy</a></p>
    </main>`
  }
  const gate = (text, btn) => html`<${SiteNav} /><main class="gate"><p class="lead">${text}</p>${btn}</main>`
  if (s.closed === 'elsewhere') return gate('This room is open in another tab.', html`<button class="primary big" onClick=${() => location.reload()}>Use it here</button>`)
  if (s.closed === 'removed') return gate('The host removed you from this room.', html`<button class="big" onClick=${() => go('/')}>Home</button>`)
  if (s.closed === 'missing') return gate(html`Room <b class="code">${code}</b> was not found. Rooms close a day after they were last used.`, html`<button class="primary big" onClick=${() => go('/')}>Make a new one</button>`)
  if (!s.room) return html`<main class="gate"><p class="dim">Connecting to ${code}…</p></main>`
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
  const [menu, setMenu] = useState(false)
  const [tvHelp, setTvHelp] = useState(false)
  const inGame = room.phase === 'game' && room.inst
  const meta = room.inst ? META[room.inst.id] : null
  const here = room.members.filter(m => m.online).length
  return html`<div class=${'room' + (s.chatOpen ? ' chat-on' : '')}>
    <header class="bar">
      <button class="icon bar-btn" onClick=${leave} aria-label="Leave the room" title="Leave">${ICONS.back}</button>
      ${inGame
        ? html`<button class="bar-game" id="rules-btn" onClick=${() => setRules(room.inst.id)} title="How to play"><${GameIcon} m=${meta} size="tiny" /><span class="vh">How to play </span><span class="ell">${meta.name}</span>${ICONS.help}</button>`
        : html`<span class="bar-here ell">${room.screens ? `${here} here · on TV` : `${plural(here, 'player')} here`}</span>`}
      ${s.status !== 'open' ? html`<span class="pill warn">reconnecting</span>` : ''}
      ${room.screens ? html`<span class="pill tv-pill" title="This room is on a shared screen">On TV</span>` : ''}
      ${inGame && isHost && !room.inst.intro && !room.inst.paused ? html`<button class="icon bar-btn" onClick=${() => send({ t: 'pause', mins: 5 })} aria-label="Pause the game for everyone" title="Pause">${ICONS.pause}</button>` : ''}
      <button class="bar-code" onClick=${() => { S.invite = true; changed() }} aria-label=${`Invite friends to room ${room.code}`} title="Invite friends: share, copy the link or show a QR code"><span class="code">${room.code}</span>${ICONS.share}</button>
      <button class="icon bar-btn chat-btn" onClick=${toggleChat} aria-label=${s.unread ? `Chat, ${s.unread} new` : 'Chat'} title="Chat">${ICONS.chat}${s.unread ? html`<i>${s.unread}</i>` : ''}</button>
      <button class="icon bar-btn" onClick=${() => setMenu(!menu)} aria-label=${inGame ? 'More: light or dark, how to play, end the game' : 'More: light or dark'} aria-haspopup="dialog" aria-expanded=${menu} title="More">${ICONS.more}</button>
    </header>
    ${menu && html`<${RoomMenu} meta=${inGame ? meta : null} isHost=${isHost} onRules=${() => setRules(room.inst.id)} onTv=${() => setTvHelp(true)} onClose=${() => setMenu(false)} />`}
    ${tvHelp && html`<${TvHelp} code=${room.code} onClose=${() => setTvHelp(false)} />`}
    <div class="room-body">
      <main class="room-main">
        ${room.night && html`<${NightBanner} night=${room.night} isHost=${isHost} />`}
        ${room.phase === 'lobby' && html`<${Lobby} isHost=${isHost} onRules=${setRules} />`}
        ${room.phase === 'game' && room.inst && html`<${GameScreen} key=${room.inst.n} />`}
        ${inGame && room.inst.paused && html`<${PauseCover} paused=${room.inst.paused} isHost=${isHost} />`}
        ${inGame && !room.inst.intro && room.inst.players.includes(ME) && REACT_PHASES.has(s.game?.phase) && html`<${ReactDock} />`}
        ${room.phase === 'results' && room.inst && html`<${Results} isHost=${isHost} />`}
      </main>
      ${s.chatOpen && html`<${Chat} />`}
    </div>
    ${rules && html`<${RulesModal} id=${rules} onClose=${() => setRules(null)} />`}
    ${s.invite && html`<${InviteModal} code=${room.code} onClose=${() => { S.invite = false; changed() }} />`}
    ${inGame && html`<${RulesIntro} key=${room.code + room.inst.n} inst=${room.inst} code=${room.code} />`}
    <${ReactFloat} />
  </div>`
}

// ---------- reactions ----------

/** Phases in which a game is showing how something went: the moment for a reaction. */
const REACT_PHASES = new Set(['reveal', 'result', 'sold', 'show', 'over'])

const react = k => send({ t: 'react', r: k })
const StickerButtons = ({ size = 34 }) => STICKERS.map(s => html`<button key=${s.k} type="button" class="react-btn" onClick=${() => react(s.k)} aria-label=${s.label} title=${s.label}><${Sticker} k=${s.k} size=${size} /></button>`)

/** While a round's answers are up: the stickers in a bar docked at the bottom of the game, one tap each. */
function ReactDock() {
  return html`<div class="react-dock" role="group" aria-label="React: send a sticker to everyone"><span class="rd-k" aria-hidden="true">React</span><div class="rd-row"><${StickerButtons} size=${32} /></div></div>`
}

/** On the results screen: a button in the action bar that opens the stickers above it. */
export function ReactButton() {
  const [open, setOpen] = useState(false)
  const box = useRef()
  useEffect(() => {
    if (!open) return
    const out = e => { if (!box.current?.contains(e.target)) setOpen(false) }
    const t = setTimeout(() => setOpen(false), 8000)
    addEventListener('pointerdown', out)
    return () => { clearTimeout(t); removeEventListener('pointerdown', out) }
  }, [open])
  return html`<span class="react-pop" ref=${box}>
    ${open ? html`<span class="react-tray" role="group" aria-label="Send a reaction"><${StickerButtons} /></span>` : ''}
    <button type="button" class="ghost-btn react-open" aria-expanded=${open} onClick=${() => setOpen(!open)}><${Sticker} k="haha" size=${22} />React</button>
  </span>`
}

/** Stickers anyone sends rise up the screen with the sender's name, spread out so they do not land on each other. */
function ReactFloat({ big = false }) {
  const [items, setItems] = useState([])
  const recent = useRef([])
  useEffect(() => onEvent(ev => {
    if (ev.k !== 'react' || !STICKER[ev.r]) return
    let x = 0
    for (let i = 0; i < 12; i++) { x = 6 + Math.random() * 78; if (recent.current.every(r => Math.abs(r - x) > 13)) break }
    recent.current = [...recent.current.slice(-3), x]
    const it = { key: Math.random(), r: ev.r, who: ev.id, x, tilt: Math.round(Math.random() * 30 - 15) }
    setItems(l => [...l.slice(-15), it])
    setTimeout(() => setItems(l => l.filter(x => x !== it)), 2900)
  }), [])
  return html`<div class=${'react-float' + (big ? ' big' : '')} aria-hidden="true">${items.map(it => html`<span key=${it.key} class="rf" style=${`left:${it.x}%;--tilt:${it.tilt}deg`}>
    <${Sticker} k=${it.r} size=${big ? 110 : 60} /><i>${it.who === ME ? 'You' : nameOf(it.who)}</i></span>`)}</div>`
}

// ---------- the last round, and a buzz for a good one ----------

const buzzOn = () => local.get('gn.buzz', 'on') !== 'off'

/** One line at the top of a round on how the last one ended (the answer, and what you got). */
function LastRound({ mod, inst }) {
  const r = S.recap
  if (!mod?.recap || !r || r.n !== inst.n || !S.game || REACT_PHASES.has(S.game.phase)) return null
  const x = mod.recap(r.v)
  if (!x) return null
  const mine = inst.players.includes(ME) && !S.screen
  return html`<div class="last-round" role="note"><span class="lr-k">Last round</span><span class="lr-t">${x.text}</span>${mine ? (x.pts > 0 ? html`<${Plus} n=${x.pts} />` : html`<span class="lr-miss">no points</span>`) : ''}</div>`
}

/** A short double buzz when a round ends your way (Android phones; others have no vibration for web pages). */
function useBuzz(mod, inst) {
  const key = S.recap?.n === inst.n ? S.recap.key : null
  useEffect(() => {
    if (!key || !mod?.recap || S.screen || !buzzOn() || !navigator.vibrate) return
    if (mod.recap(S.recap.v)?.good) try { navigator.vibrate([30, 60, 40]) } catch { /* not allowed */ }
  }, [key, !!mod])
}

const svg = d => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="ico">${d}</svg>`
/** The room's small line icons (a fresh copy each time one is used). */
export const ICONS = {
  get back() { return svg(html`<path d="M15 18l-6-6 6-6" />`) },
  get help() { return svg(html`<circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9M12 16.8v.2" />`) },
  get share() { return svg(html`<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />`) },
  get chat() { return svg(html`<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />`) },
  get more() { return html`<svg viewBox="0 0 24 24" aria-hidden="true" class="ico fillico"><circle cx="5.5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="18.5" cy="12" r="1.9" /></svg>` },
  get close() { return svg(html`<path d="M6 6l12 12M18 6L6 18" />`) },
  get sun() { return svg(html`<circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />`) },
  get moon() { return svg(html`<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />`) },
  get pause() { return html`<svg viewBox="0 0 24 24" aria-hidden="true" class="ico fillico"><rect x="6" y="5" width="4.2" height="14" rx="1.4" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" /></svg>` },
  get tv() { return svg(html`<rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" />`) },
  get stop() { return svg(html`<rect x="5" y="5" width="14" height="14" rx="3" />`) },
  get copy() { return svg(html`<rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />`) },
  get qr() { return svg(html`<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />`) },
  get play() { return html`<svg viewBox="0 0 24 24" aria-hidden="true" class="ico fillico"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>` },
  get crown() { return html`<svg viewBox="0 0 24 24" aria-hidden="true" class="crown-ico"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" /></svg>` },
  get trophy() { return svg(html`<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />`) },
  get people() { return svg(html`<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.75" />`) },
}

/** The menu behind the dots in the room's top bar: light or dark, the rules, and (for the host) ending the game. */
function RoomMenu({ meta, isHost, onRules, onTv, onClose }) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const [buzz, setBuzz] = useState(buzzOn())
  const flipBuzz = () => { local.set('gn.buzz', buzz ? 'off' : 'on'); setBuzz(!buzz); if (!buzz) try { navigator.vibrate?.(40) } catch { /* not allowed */ } }
  const box = useRef()
  useFocusTrap(box)
  const pick = t => { if (document.documentElement.dataset.theme !== t) window.toggleTheme?.(); setTheme(t) }
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const end = async () => {
    onClose()
    if (await ask({ title: 'End this game for everyone?', body: 'Everyone goes back to the lobby and nobody gets points for it.', ok: 'End game', cancel: 'Keep playing', danger: true })) send({ t: 'abort' })
  }
  return html`<div class="menu-shade" onClick=${onClose}></div>
    <div class="room-menu" role="dialog" aria-label="Room menu" ref=${box}>
      <div class="menu-look"><span>Look</span>
        <div class="seg" role="radiogroup" aria-label="Light or dark">
          <button type="button" role="radio" aria-checked=${theme === 'light'} class=${theme === 'light' ? 'on' : ''} onClick=${() => pick('light')}>${ICONS.sun}Light</button>
          <button type="button" role="radio" aria-checked=${theme !== 'light'} class=${theme !== 'light' ? 'on' : ''} onClick=${() => pick('dark')}>${ICONS.moon}Dark</button>
        </div></div>
      ${navigator.vibrate ? html`<label class="menu-item menu-switch"><span>Buzz on a right answer<small>A short vibration when a round goes your way</small></span>
        <button type="button" role="switch" aria-checked=${buzz} aria-label="Buzz on a right answer" class=${'switch' + (buzz ? ' on' : '')} onClick=${flipBuzz}><i></i></button></label>` : ''}
      <hr /><button type="button" class="menu-item" onClick=${() => { onClose(); onTv() }}>${ICONS.tv}<span>Show on a TV<small>Questions and scores on a big screen</small></span></button>
      ${meta ? html`<hr /><button type="button" class="menu-item" onClick=${() => { onClose(); onRules() }}>${ICONS.help}How to play ${meta.name}</button>` : ''}
      ${meta && isHost ? html`<hr /><button type="button" class="menu-item danger-text" onClick=${end}>${ICONS.stop}<span>End the game for everyone<small>Only the host sees this</small></span></button>` : ''}
    </div>`
}

/** A game's icon (an SVG made by scripts/build-site.mjs from src/icons.ts). */
export function GameIcon({ m, size }) {
  return html`<span class=${'gicon' + (size ? ' ' + size : '')} dangerouslySetInnerHTML=${{ __html: m?.icon ?? '' }} />`
}

/** Light or dark. The page's head script owns the setting; the icon comes from CSS. */
function ThemeButton() {
  return html`<button class="theme-btn" type="button" onClick=${() => window.toggleTheme?.()} aria-label="Switch between light and dark mode" title="Light or dark">
    <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></button>`
}

function toggleChat() {
  S.chatOpen = !S.chatOpen
  S.unread = 0
  changed()
  if (S.chatOpen) setTimeout(() => document.getElementById('chat-in')?.focus(), 50)
}

/** A game's rules as a numbered list. */
const RulesList = ({ m }) => html`<ol class="rules">${m.rules.map((r, i) => html`<li key=${i}><span>${i + 1}</span>${r}</li>`)}</ol>`
const RulesHead = ({ m, id }) => html`<div class="rules-head"><${GameIcon} m=${m} size="rule" /><div><div class="dim small">How to play</div><h2 class="nomargin" id=${id}>${m.name}</h2></div></div>`

function RulesModal({ id, onClose }) {
  const m = META[id]
  const box = useRef()
  useFocusTrap(box)
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <div class="card stack modal-card rules-card" ref=${box}><div class="row between nowrap"><${RulesHead} m=${m} id="rules-title" /><button class="icon" onClick=${onClose} aria-label="Close">${ICONS.close}</button></div>
    <${RulesList} m=${m} /></div></div>`
}

// ---------- the rules before each game ----------

const INTRO_S = 30
const introClosed = new Set() // games whose rules this page has closed, so a reconnect does not show them again

/**
 * Before every game the rules are up for everyone. Tapping anywhere closes them: they shrink into the game's name at the
 * top, where they can be opened again. The game (and its clock) starts when everyone has closed them, or after 30 s.
 */
function RulesIntro({ inst, code }) {
  const key = code + ':' + inst.n
  const [state, setState] = useState(() => inst.intro && !inst.intro.ready.includes(ME) && !introClosed.has(key) ? 'open' : 'closed')
  const card = useRef()
  useFocusTrap(card, state === 'open')
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
      <${RulesHead} m=${m} id="intro-title" />
      <${RulesList} m=${m} />
      <div class="intro-time" aria-hidden="true"><i style=${{ width: `${(left / INTRO_S) * 100}%` }}></i></div>
      <div class="intro-foot">
        <span class="dim small">The game starts in ${Math.ceil(left)} s, or when everyone has read this. Your time starts then.</span>
        <button class="primary big" onClick=${e => { e.stopPropagation(); close() }}>Got it</button>
      </div>
    </div>
  </div>`
}

/** Shrinks an element into another (the rules into the game's name at the top), then gives the button a nudge. */
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
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' })
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
  return html`<div class="wrap narrow intro-wait">
    <div class="center intro-top"><${GameIcon} m=${m} size="huge" /><h2 class="nomargin">${m.name}</h2>
      <p class="dim nomargin">Starting in <b class="ink">${left} s</b>, or as soon as everyone has read the rules.</p></div>
    <ul class="ready-list">${here.map(id => html`<li key=${id} class=${ready.includes(id) ? 'ok' : ''}><${Avatar} id=${id} size=${30} /><span class="grow ell"><${Name} id=${id} /></span><span class="small">${ready.includes(id) ? 'ready' : 'reading…'}</span></li>`)}</ul>
    <p class="dim small center">Need the rules again? Tap the game's name at the top.</p>
  </div>`
}

// ---------- lobby ----------

function Lobby({ isHost, onRules }) {
  const room = S.room
  const [tab, setTab] = useState(room.night && room.night.idx === -1 ? 'night' : 'games')
  useEffect(() => { if (room.night && room.night.idx === -1) setTab('night') }, [!!room.night])
  return html`<div class="lobby">
    <aside class="lobby-side">
      <section class="card code-card">
        <div class="dim small">Room code</div>
        <div class="code big-code">${room.code}</div>
        <div class="dim small">${roomLink(room.code).replace(/^https?:\/\//, '')}</div>
        <${InviteButtons} code=${room.code} />
      </section>
      <section class="card players-card"><${Players} isHost=${isHost} /></section>
      <${WatchSwitch} isHost=${isHost} />
      <div class="card folds">
        <${PointsHelp} />
        ${room.history.length ? html`<details class="fold hist"><summary>Played here (${room.history.length})</summary><ul class="plain small">${room.history.map((h, i) => html`<li key=${i} class="with-icon"><${GameIcon} m=${META[h.id]} size="tiny" />${META[h.id]?.name}: ${h.winners.length ? h.winners.map(nameOf).join(' & ') : html`<span class="dim">no winner</span>`}</li>`)}</ul></details>` : ''}
      </div>
    </aside>
    <section class="lobby-main">
      <div class="seg tabs" role="tablist">
        <button role="tab" aria-selected=${tab === 'games'} class=${tab === 'games' ? 'on' : ''} onClick=${() => setTab('games')}>Pick a game</button>
        <button role="tab" aria-selected=${tab === 'night'} class=${tab === 'night' ? 'on' : ''} onClick=${() => setTab('night')}>Game night</button>
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
    <div class="row between"><h2 class="plain-h">Players <span class="dim">${room.members.filter(m => m.online).length} here</span></h2>${played ? html`<span class="dim small strong">room points</span>` : ''}</div>
    <ul class="plist">${list.map(m => html`<li key=${m.id} class=${m.online ? '' : 'off'}>
      <${Avatar} id=${m.id} size=${34} off=${!m.online} /><span class="grow pname"><span class="ell"><${Name} id=${m.id} /></span>${m.id === room.host ? html`<span class="host" title="Host" role="img" aria-label="Host">${ICONS.crown}</span>` : ''}${m.online ? '' : html`<span class="dim small strong">away</span>`}</span>
      ${played && m.wins ? html`<span class="wins" title="Wins">${ICONS.trophy}${m.wins}</span>` : ''}${played ? html`<b class="ppts">${m.pts}</b>` : ''}
      ${isHost && m.id !== ME ? html`<button class="icon pdots" onClick=${() => setMenu(menu === m.id ? null : m.id)} aria-label=${`Options for ${m.name}`} aria-expanded=${menu === m.id}>${ICONS.more}</button>` : ''}
      ${menu === m.id ? html`<div class="pmenu"><button onClick=${() => { send({ t: 'host', id: m.id }); setMenu(null) }}>Make host</button><button class="danger-text" onClick=${async () => { setMenu(null); if (await ask({ title: `Remove ${m.name}?`, body: 'They are taken out of the room and any game they are in.', ok: 'Remove', danger: true })) send({ t: 'kick', id: m.id }) }}>Remove</button></div>` : ''}
    </li>`)}</ul>
  </div>`
}

/** Whether people who are not in a game (late arrivals, knocked-out players) can follow it. On unless the host says. */
function WatchSwitch({ isHost }) {
  const on = S.room.watch !== false
  if (!isHost) return on ? '' : html`<p class="dim small watch-note">Watching is off: anyone not in a game waits for the next one.</p>`
  return html`<label class="card switch-row">
    <span><b>Let people watch</b><span class="dim small">Anyone who arrives mid-game can follow it live and plays from the next game.</span></span>
    <button type="button" role="switch" aria-checked=${on} aria-label="Let people watch" class=${'switch' + (on ? ' on' : '')} onClick=${() => send({ t: 'watch', on: !on })}><i></i></button>
  </label>`
}

// The same table as src/points.ts, for the lobby's explanation.
const POINTS = [[2, '10 · 0'], [3, '10 · 5 · 0'], [4, '10 · 7 · 3 · 0'], [5, '10 · 7 · 5 · 3 · 0'], [6, '10 · 7 · 5 · 4 · 2 · 0'], ['8+', '10 · 7 · 5 · 4 · 3 · 2 · 1 … 0']]

function PointsHelp() {
  return html`<details class="fold points-help"><summary>How room points work</summary>
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
    <div class="chips scroller" role="group" aria-label="Filters">
      <button class=${'chipbtn' + (fit ? ' sel' : '')} aria-pressed=${fit} onClick=${() => setFit(!fit)}>Fits ${n} ${n === 1 ? 'player' : 'players'}</button>
      ${Object.entries(MOODS).map(([k, label]) => html`<button key=${k} class=${'chipbtn' + (mood === k ? ' sel' : '')} aria-pressed=${mood === k} onClick=${() => setMood(mood === k ? null : k)}>${label}</button>`)}
    </div>
    <ul class="picks">${list.map(m => html`<li key=${m.id}><button class=${'pick' + (m.id === pick.id ? ' sel' : '')} aria-pressed=${m.id === pick.id} aria-disabled=${isHost || m.id === pick.id ? null : 'true'} onClick=${isHost ? () => send({ t: 'pick', id: m.id }) : m.id === pick.id ? null : hostOnly('pick the game')}>
      <${GameIcon} m=${m} size="pick" /><span><b>${m.name}</b><span class="dim">${players(m)} · ~${estMinutes(m, Math.max(n, m.min))} min</span></span></button></li>`)}
      ${!list.length ? html`<li class="dim">No game fits these filters.</li>` : ''}</ul>
    ${!isHost ? html`<p class="dim small center">The host picks the game. You can read the rules meanwhile.</p>` : ''}
  </div>`
}

function DnaBars({ dna }) {
  return html`<div class="dna">${DNA.map(([k, label]) => html`<div key=${k}><span class="small dim">${label}</span><span class="dots" role="img" aria-label=${`${label} ${dna[k]} of 5`}>${[1, 2, 3, 4, 5].map(i => html`<i class=${i <= dna[k] ? 'on' : ''}></i>`)}</span></div>`)}</div>`
}

/** A choice with a few short options is a row of buttons; a longer one, or a number, keeps its box. */
const asButtons = o => o.kind === 'choice' && o.choices.length <= 4 && o.choices.reduce((n, c) => n + String(c[1]).length, 0) <= 30

/** A game's settings. Everyone sees them; only the host can change them, and onSet gets the whole new set. */
export function GameOptions({ meta, cfg, isHost, onSet }) {
  const val = o => cfg[o.key] ?? o.def
  const set = (k, v) => onSet({ ...cfg, [k]: v })
  const uid = o => `opt-${meta.id}-${o.key}`
  return html`<div class=${'opts' + (isHost ? '' : ' locked')} onClick=${isHost ? null : hostOnly('change the settings')}>${meta.options.map(o => asButtons(o)
      ? html`<div key=${o.key} class="opt"><span id=${uid(o)}>${o.label}</span>
          <div class="seg" role="radiogroup" aria-labelledby=${uid(o)}>${o.choices.map(([v, l]) => {
            const on = String(val(o)) === String(v)
            return html`<button key=${String(v)} type="button" role="radio" aria-checked=${on} class=${on ? 'on' : ''} disabled=${!isHost} onClick=${() => set(o.key, v)}>${l}</button>`
          })}</div></div>`
      : html`<label key=${o.key} class="opt"><span>${o.label}</span>
      ${o.kind === 'choice'
        ? html`<select disabled=${!isHost} value=${String(val(o))} onChange=${e => set(o.key, e.target.value)}>${o.choices.map(([v, l]) => html`<option value=${String(v)}>${l}</option>`)}</select>`
        : html`<span class="num"><input type="number" inputmode="numeric" disabled=${!isHost} min=${o.min} max=${o.max} key=${o.key + ':' + val(o)} defaultValue=${val(o)} onChange=${e => set(o.key, Number(e.target.value))} />${o.unit ? html`<span class="dim small">${o.unit === 's' ? 'sec' : o.unit}</span>` : ''}</span>`}
    </label>`)}</div>`
}

/** The settings a night's game will be played with: the night's presets until the host changes them. */
export const nightCfg = (night, id) => night.configs?.[id] ?? META[id].night

function GameDetail({ meta, isHost, n, onRules }) {
  const room = S.room
  const fits = n >= meta.min && n <= meta.max
  return html`<div class="card detail">
    <div class="detail-head"><${GameIcon} m=${meta} size="big" /><div class="grow"><h2 class="nomargin">${meta.name}</h2><div class="dim small">${players(meta)} players · about ${estMinutes(meta, Math.max(n, meta.min))} min · ${meta.cat}</div></div>
      <button class="link" onClick=${() => onRules(meta.id)}>How to play</button></div>
    <p class="detail-blurb">${meta.blurb}</p>
    <${DnaBars} dna=${meta.dna} />
    <${GameOptions} meta=${meta} cfg=${room.configs[meta.id] ?? {}} isHost=${isHost} onSet=${config => send({ t: 'config', id: meta.id, config })} />
    ${isHost
      ? html`<button class="primary big wide start-btn" disabled=${!fits} onClick=${() => send({ t: 'start', id: meta.id })}>${fits ? html`${ICONS.play}Start ${meta.name}` : n < meta.min ? `Needs ${meta.min}+ players (${n} here)` : `Up to ${meta.max} players`}</button>`
      : html`<div class="host-wait"><span class="wait-dots" aria-hidden="true"><i></i><i></i><i></i></span>Waiting for ${nameOf(room.host)} to start</div>`}
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
  const [open, setOpen] = useState(null)
  const planned = night && night.idx === -1
  const total = night ? night.plan.reduce((a, id) => a + estMinutes(META[id], n), 0) : 0
  return html`<div class="stack">
    <div class="card detail">
      <div><h2 class="nomargin">Plan a game night</h2>
      <p class="dim small nomargin">Pick how long and what kind of fun. The games are chosen for ${plural(n, 'player')}, with one table across all of them.</p></div>
      <div class="lengths">${LENGTHS.map(([k, label, sub]) => html`<button key=${k} class=${'len' + (length === k ? ' sel' : '')} aria-pressed=${length === k} aria-disabled=${isHost ? null : 'true'} onClick=${isHost ? () => setLength(k) : hostOnly('plan the night')}><b>${label}</b><span>${sub}</span></button>`)}</div>
      ${length === 'tournament' ? html`<p class="small dim nomargin">Tournament: after each game the bottom of the table is knocked out. The last two play the final.</p>` : ''}
      <div class="opt"><span>How are you feeling? (up to 4)</span><div class="chips">${Object.entries(MOODS).map(([k, label]) => html`<button key=${k} class=${'chipbtn sunk' + (moods.includes(k) ? ' sel' : '')} aria-pressed=${moods.includes(k)} aria-disabled=${isHost ? null : 'true'} onClick=${isHost ? () => toggle(k) : hostOnly('plan the night')}>
${label}</button>`)}</div></div>
      ${isHost ? html`<button class=${planned ? '' : 'primary big'} onClick=${() => send({ t: 'night', length, moods })}>${planned ? 'Plan again' : 'Plan the night'}</button>` : html`<p class="dim small nomargin">The host plans the night.</p>`}
    </div>
    ${planned && html`<div class="card detail">
      <div class="row between"><h2 class="nomargin">Tonight's games</h2><span class="dim small">${night.length === 'endless' ? 'keeps going' : `about ${total} min`}</span></div>
      <ol class="plan">${night.plan.map((id, i) => html`<li key=${i}><div class="plan-row"><${GameIcon} m=${META[id]} size="mid" /><span class="grow"><b>${META[id].name}</b><span class="dim small"> · ~${estMinutes(META[id], n)} min${night.length === 'tournament' && i === night.plan.length - 1 ? ' · final' : ''}</span></span>
        <span class="plan-acts"><button class="link" aria-expanded=${open === i} onClick=${() => setOpen(open === i ? null : i)}>settings</button>${isHost ? html`<button class="link" onClick=${() => { setOpen(null); send({ t: 'nightSwap', i }) }}>swap</button>${night.length !== 'tournament' && night.plan.length > 1 ? html`<button class="link" onClick=${() => { setOpen(null); send({ t: 'nightDrop', i }) }}>remove</button>` : ''}` : ''}</span></div>
        ${open === i ? html`<div class="plan-opts"><${GameOptions} meta=${META[id]} cfg=${nightCfg(night, id)} isHost=${isHost} onSet=${config => send({ t: 'nightConfig', id, config })} /></div>` : ''}</li>`)}</ol>
      ${isHost ? html`<div class="row nowrap"><button class="primary big grow" onClick=${() => send({ t: 'nightGo' })}>Start the night</button><button class="big" onClick=${() => send({ t: 'nightEnd' })}>Cancel</button></div>` : html`<p class="dim center nomargin">Waiting for the host to start the night</p>`}
    </div>`}
  </div>`
}

function NightBanner({ night, isHost }) {
  if (night.idx < 0) return null
  const room = S.room
  const label = LENGTHS.find(l => l[0] === night.length)?.[1]
  const out = night.length === 'tournament' ? room.members.filter(m => night.alive.length && !night.alive.includes(m.id)).map(m => m.id) : []
  return html`<div class="night-banner">
    <span><b>${label} night</b> · game ${Math.min(night.idx + 1, night.plan.length)} of ${night.length === 'endless' ? '∞' : night.plan.length}</span>
    <span class="plan-mini">${night.plan.map((id, i) => html`<span key=${i} class=${i < night.idx ? 'past' : i === night.idx ? 'now' : ''} title=${META[id].name}><${GameIcon} m=${META[id]} size="small" /></span>`)}</span>
    ${out.includes(ME) ? html`<span class="pill">knocked out: watching</span>` : ''}
  </div>`
}

export function NightTable({ night }) {
  const ids = Object.keys(night.points).sort((a, b) => night.points[b] - night.points[a])
  const last = night.rounds[night.rounds.length - 1]
  let place = 0
  return html`<div class="card"><h2>Game night table</h2><div class="scroll"><table class="tbl night-tbl">
    <tr><th>#</th><th>Player</th>${night.rounds.map(r => html`<th class="num-c" title=${META[r.id].name}><${GameIcon} m=${META[r.id]} size="tiny" /></th>`)}<th class="total">Total</th></tr>
    ${ids.map((id, i) => {
      if (i === 0 || night.points[id] !== night.points[ids[i - 1]]) place = i + 1
      const out = night.length === 'tournament' && !night.alive.includes(id)
      return html`<tr key=${id} class=${(id === ME ? 'me' : '') + (out ? ' out' : '')}><td>${place}</td><td><${Name} id=${id} />${last?.out.includes(id) ? html` <span class="pill warn">out</span>` : ''}</td>${night.rounds.map(r => html`<td class="dim num-c">${r.points[id] ?? '–'}</td>`)}<td class="total"><b>${night.points[id]}</b></td></tr>`
    })}
  </table></div></div>`
}

// ---------- playing ----------

export const mods = {}

/**
 * A game's screen, loaded when it is first needed. A page left open across an update of the site asks its older shared
 * files for things only the new ones have, and the game fails to load: the page reloads once (never more than once a
 * minute) to pick up the new version, and rejoins the room where it was.
 */
export function loadGame(id) {
  if (mods[id]) return Promise.resolve(mods[id])
  return import(`./games/${id}.js`).then(m => (mods[id] = m), e => {
    let last = 0
    try { last = Number(sessionStorage.getItem('gn.reload')) || 0 } catch { /* private mode */ }
    if (Date.now() - last > 60_000) {
      try { sessionStorage.setItem('gn.reload', String(Date.now())) } catch { /* private mode */ }
      location.reload()
    }
    throw e
  })
}

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
    loadGame(inst.id).then(setMod).catch(() => toast('Could not load the game. Refresh the page.'))
  }, [inst.id])
  useBuzz(mod, inst)
  if (inst.intro) return html`<${IntroWait} inst=${inst} />`
  const seated = inst.players.includes(ME)
  if (!seated && !s.room.watch) return html`<${NoWatching} inst=${inst} />`
  if (!mod || !s.game) return html`<div class="wrap"><p class="dim">Loading…</p></div>`
  const Game = mod.default
  const missed = s.missed?.n === inst.n && REPLAY.has(inst.id) && seated ? s.missed : null
  return html`<div class=${'game-area g-' + inst.id} ref=${area}>
    ${!seated ? html`<div class="watch">You are watching this game. You will be in the next one.</div>` : ''}
    <${LastRound} mod=${mod} inst=${inst} />
    <${Game} v=${s.game} inst=${inst} seated=${seated} />
    ${missed && html`<${MissedReveal} key=${missed.v.round} Game=${Game} v=${missed.v} inst=${inst} />`}
  </div>`
}

// Games whose reveal screen can be shown again on its own: no sound, and no keys taken from the whole page.
const REPLAY = new Set(['trivia', 'closest', 'bluff', 'connections', 'geoguess', 'imposter', 'mindmeld', 'mostlikely', 'movieguess'])
const MISSED_S = 12

/** The reveal a player missed while their phone was reconnecting (the answer, and what everyone picked), shown once. */
function MissedReveal({ Game, v, inst }) {
  const card = useRef()
  useFocusTrap(card)
  const close = () => { S.missed = null; changed() }
  useEffect(() => {
    const t = setTimeout(close, MISSED_S * 1000)
    const onKey = e => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => { clearTimeout(t); removeEventListener('keydown', onKey) }
  }, [])
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && close()} role="dialog" aria-modal="true" aria-labelledby="missed-h">
    <div class="card stack modal-card missed-card" ref=${card}>
      <div class="missed-head"><div><h2 class="nomargin" id="missed-h">You missed this</h2><p class="dim small nomargin">Your phone was away for a moment. Here is how the last round ended.</p></div>
        <button class="primary" onClick=${close}>Back to the game</button></div>
      <div class="missed-view" inert>${html`<${Game} v=${v} inst=${inst} seated=${true} />`}</div>
      <div class="intro-time" aria-hidden="true"><i class="drain" style=${`animation-duration:${MISSED_S}s`}></i></div>
    </div>
  </div>`
}

const PAUSE_MINS = [1, 2, 5]
const clockText = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

/** While the host has paused the game: everyone's clock has stopped, and it carries on by itself when the time is up. */
function PauseCover({ paused, isHost }) {
  useTick(250)
  const btn = useRef()
  useEffect(() => { btn.current?.focus() }, [])
  const left = Math.max(0, paused.until - now())
  return html`<div class="pause-cover" role="dialog" aria-labelledby="pause-h" aria-describedby="pause-p">
    <div class="card stack pause-card">
      <span class="pause-ico" aria-hidden="true">${ICONS.pause}</span>
      <h2 class="nomargin" id="pause-h">Game paused</h2>
      <p class="dim nomargin" id="pause-p">${isHost ? 'Everyone’s clock has stopped.' : `${nameOf(S.room.host)} paused the game. Everyone’s clock has stopped.`}</p>
      <div class="pause-left" role="timer">Carries on in <b>${clockText(left)}</b></div>
      ${isHost ? html`<div class="opt pause-for"><span id="pause-for">Pause for</span>
        <div class="seg" role="group" aria-labelledby="pause-for">${PAUSE_MINS.map(m => html`<button key=${m} type="button" onClick=${() => send({ t: 'pause', mins: m })}>${m} min</button>`)}</div></div>
        <button class="primary big" ref=${btn} onClick=${() => send({ t: 'resume' })}>${ICONS.play}Resume now</button>` : ''}
    </div>
  </div>`
}

/** Not in this game, and the host has turned watching off: who is playing, and that the next game is theirs. */
function NoWatching({ inst }) {
  const m = META[inst.id]
  return html`<div class="wrap narrow intro-wait">
    <div class="center intro-top"><${KindCard} id=${inst.id} cls="solo" /><h1 class="nomargin">${m.name} is on</h1>
      <p class="lead nomargin">The host has turned off watching, so the game is hidden. You will be in the next one.</p></div>
    <ul class="ready-list">${inst.players.map(id => html`<li key=${id}><${Avatar} id=${id} size=${30} /><span class="grow ell"><${Name} id=${id} /></span><span class="small dim">playing</span></li>`)}</ul>
  </div>`
}

// ---------- TV mode ----------
// A TV, laptop or projector everyone can see shows the room: the code to join, the rules, each question and its
// answers, the scores and the reactions. Phones keep their own screens for what only their player may see and to
// answer. The screen joins as a watcher, so it never learns anything a player's phone keeps secret.

/**
 * How big to draw everything: as big as the screen's width allows, but never taller than the screen, since nobody
 * scrolls a TV. What is shown is measured whenever it changes size, and the scale follows.
 */
function useTvFit(box) {
  const wide = () => Math.min(2.4, innerWidth / 1180)
  const [z, setZ] = useState(() => Math.max(1, Math.min(wide(), innerHeight / 740)))
  const zr = useRef(z)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const bar = document.querySelector('.tv-bar')?.offsetHeight ?? 70
      const natural = el.getBoundingClientRect().height / zr.current
      if (!natural) return
      const next = Math.max(0.7, Math.min(wide(), (innerHeight - bar - 28) / natural))
      if (Math.abs(next - zr.current) / zr.current > 0.02) { zr.current = next; setZ(next) }
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    addEventListener('resize', fit)
    return () => { ro.disconnect(); removeEventListener('resize', fit) }
  }, [])
  return z
}

function TvGate({ code }) {
  const s = useStore()
  useEffect(() => {
    document.title = code ? `TV · Room ${code} · Game Night` : 'Show on a TV · Game Night'
    if (!code) return
    connect(code, { tv: true })
    keepAwake(true)
    return () => { keepAwake(false); disconnect() }
  }, [code])
  if (!code) return html`<${TvStart} />`
  if (s.closed === 'missing') return html`<main class="tv-gate"><p class="lead">Room <b class="code">${code}</b> was not found. Rooms close a day after they were last used.</p><button class="big" onClick=${() => go('/tv')}>Try another code</button></main>`
  if (!s.room) return html`<main class="tv-gate"><p class="dim">Connecting to ${code}…</p></main>`
  return html`<${TvRoom} />`
}

/** games.amittal.dev/tv: type the room's code on the big screen. */
function TvStart() {
  const [code, setCode] = useState('')
  const show = () => { const c = codeFrom(code); if (!/^[A-Z0-9]{5}$/.test(c)) return toast('Room codes are 5 characters'); go('/tv/' + c) }
  return html`<main class="tv-gate">
    <span class="tv-big-ico" aria-hidden="true">${ICONS.tv}</span>
    <h1 class="nomargin">Show a room on this screen</h1>
    <p class="lead">Everyone plays on their own phone. This screen shows the questions, the answers, the scores and the reactions, big enough for the whole room.</p>
    <div class="join-row tv-code-in"><input class="code-in" maxlength="200" onInput=${e => setCode(e.target.value)} onKeyDown=${e => e.key === 'Enter' && show()} placeholder="Room code" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Room code" autofocus /><button class="primary big" onClick=${show}>Show it</button></div>
    <p class="dim small">The host finds the code at the top of the room, or under ••• › Show on a TV.</p>
  </main>`
}

function TvRoom() {
  const s = useStore()
  const room = s.room
  const inst = room.inst
  const fitBox = useRef()
  const z = useTvFit(fitBox)
  const [mod, setMod] = useState(null)
  useEffect(() => { setMod(inst && mods[inst.id] ? mods[inst.id] : null); if (inst) loadGame(inst.id).then(setMod, () => {}) }, [inst?.id])
  const meta = inst ? META[inst.id] : null
  const playing = room.phase === 'game' && inst
  let body
  if (room.phase === 'lobby' || !inst) body = html`<${TvLobby} />`
  else if (playing && inst.intro) body = html`<${TvIntro} inst=${inst} />`
  else if (playing) body = mod && s.game ? html`<div class=${'game-area tv-game g-' + inst.id}><${LastRound} mod=${mod} inst=${inst} /><${mod.default} v=${s.game} inst=${inst} seated=${false} /></div>` : html`<p class="dim center">Loading…</p>`
  else body = html`<${Results} isHost=${false} tv=${true} />`
  return html`<div class="tv" style=${`--z:${z}`}>
    <header class="tv-bar">
      <span class="tv-brand">Game Night</span>
      ${playing ? html`<span class="tv-now"><${GameIcon} m=${meta} size="tiny" />${meta.name}</span>` : ''}
      ${room.night && room.night.idx >= 0 ? html`<span class="tv-now dim">game ${Math.min(room.night.idx + 1, room.night.plan.length)} of ${room.night.length === 'endless' ? '∞' : room.night.plan.length}</span>` : ''}
      <span class="grow"></span>
      ${s.status !== 'open' ? html`<span class="pill warn">reconnecting</span>` : ''}
      <span class="tv-join">Join at <b>${location.host}</b> with code <b class="code">${room.code}</b></span>
      ${room.phase !== 'lobby' ? html`<${TvCornerQr} code=${room.code} />` : ''}
    </header>
    <main class="tv-main"><div class="tv-fit" ref=${fitBox}>${body}</div>${playing && inst.paused ? html`<${PauseCover} paused=${inst.paused} isHost=${false} />` : ''}</main>
    <${ReactFloat} big=${true} />
  </div>`
}

/** A small QR code in the TV's top bar during games, for anyone arriving late. */
function TvCornerQr({ code }) {
  const qr = useQr(code)
  return html`<span class="tv-qr-mini" dangerouslySetInnerHTML=${{ __html: qr }}></span>`
}

/** Before a game: how to join, who is here, and what is next. */
function TvLobby() {
  const room = S.room
  const qr = useQr(room.code)
  const here = room.members.filter(m => m.online)
  const night = room.night && !room.night.done ? room.night : null
  const pick = META[room.pick]
  return html`<div class="tv-lobby">
    <section class="tv-join-card">
      <div class="tv-qr" dangerouslySetInnerHTML=${{ __html: qr }}></div>
      <div class="dim">Point your phone's camera here, or go to</div>
      <div class="tv-url">${location.host}</div>
      <div class="dim">and type</div>
      <div class="code tv-code">${room.code}</div>
    </section>
    <section class="tv-side">
      <h2 class="nomargin">${plural(here.length, 'player')} here</h2>
      <ul class="tv-people">${room.members.map(m => html`<li key=${m.id} class=${m.online ? '' : 'off'}><${Avatar} id=${m.id} size=${44} off=${!m.online} /><span class="ell"><${Name} id=${m.id} you=${false} /></span>${m.id === room.host ? html`<span class="host" title="Host">${ICONS.crown}</span>` : ''}</li>`)}</ul>
      ${night ? html`<div class="tv-next"><div class="dim">Tonight's games</div><div class="tv-plan">${night.plan.map((id, i) => html`<span key=${i} class=${i <= night.idx ? 'past' : ''}><${GameIcon} m=${META[id]} size="mid" /><span>${META[id].name}</span></span>`)}</div></div>`
        : pick ? html`<div class="tv-next"><div class="dim">Up next</div><div class="tv-pick"><${GameIcon} m=${pick} size="big" /><div><b>${pick.name}</b><div class="dim">${pick.blurb}</div></div></div></div>` : ''}
      <p class="dim">${nameOf(room.host)} starts the game from their phone.</p>
    </section>
  </div>`
}

/** The rules, big, while everyone reads them on their phones. */
function TvIntro({ inst }) {
  useTick(250)
  const m = META[inst.id]
  const left = Math.max(0, Math.ceil((inst.intro.until - now()) / 1000))
  return html`<div class="tv-intro card">
    <${RulesHead} m=${m} id="tv-rules" />
    <${RulesList} m=${m} />
    <p class="dim">Starting in <b class="ink">${left} s</b>, or as soon as everyone has read the rules on their phone.</p>
  </div>`
}

/** From the room menu: how to put the room on a TV. */
function TvHelp({ code, onClose }) {
  const box = useRef()
  useFocusTrap(box)
  useEffect(() => { const onKey = e => e.key === 'Escape' && onClose(); addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey) }, [])
  const link = `${location.origin}/tv/${code}`
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="tv-title">
    <div class="card stack modal-card tv-help" ref=${box}>
      <div class="row between"><h2 class="nomargin" id="tv-title">Show it on a TV</h2><button class="icon" onClick=${onClose} aria-label="Close">${ICONS.close}</button></div>
      <p class="nomargin">Put the room on a TV, laptop or projector everyone can see. Phones keep playing; the big screen shows the questions, the answers, the scores and the reactions.</p>
      <ol class="tv-steps">
        <li>On the TV's browser, open <b>${location.host}/tv</b></li>
        <li>Type the code <b class="code">${code}</b></li>
      </ol>
      <div class="invite-btns two">${matchMedia('(pointer: coarse)').matches
        ? html`<button type="button" class="primary big" onClick=${() => share('Open this on the TV to show our game night', link)}>Share the TV link</button>
          <button type="button" class="big" onClick=${() => copy(link, 'TV link copied')}>Copy it</button>`
        : html`<button type="button" class="primary big" onClick=${() => open(link, '_blank', 'noopener')}>Open on this device</button>
          <button type="button" class="big" onClick=${() => copy(link, 'TV link copied')}>Copy the TV link</button>`}
      </div>
    </div>
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
    <button type="button" class="primary" onClick=${() => shareRoom(code)}>${ICONS.share}Share</button>
    <button type="button" onClick=${() => copyRoom(code)} aria-label="Copy the room link">${ICONS.copy}Copy</button>
    <button type="button" onClick=${openQr} aria-label="Show a QR code">${ICONS.qr}QR</button>
  </div>`
}

/** The room's QR code (the camera app opens the room), its code in big letters and its link. */
/** A QR code for a room's link: a phone camera pointed at it opens the room. */
function useQr(code) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    import('./qr.js').then(({ default: qrcode }) => {
      const q = qrcode(0, 'M')
      q.addData(roomLink(code))
      q.make()
      const n = q.getModuleCount(), pad = 4
      let d = ''
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + pad} ${y + pad}h1v1h-1z`
      setSvg(`<svg viewBox="0 0 ${n + pad * 2} ${n + pad * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code for the room link"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#15161a"/></svg>`)
    }, () => setSvg(''))
  }, [code])
  return svg
}

function InviteModal({ code, onClose }) {
  const svg = useQr(code)
  const box = useRef()
  useFocusTrap(box)
  useEffect(() => {
    track('share', { method: 'qr' })
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [code])
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="inv-title">
    <div class="card stack modal-card invite-card" ref=${box}>
      <div class="row between"><h2 class="nomargin" id="inv-title">Invite friends</h2><button class="icon" onClick=${onClose} aria-label="Close">${ICONS.close}</button></div>
      <div class="inv-body">
        <div class="stack inv-qr"><div class="qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>
          <p class="dim small center nomargin">Point a phone camera at this to join.</p></div>
        <div class="stack inv-info">
          <div class="center"><div class="dim small strong">Room code</div><div class="code big-code">${code}</div></div>
          <button type="button" class="link-line" onClick=${() => copyRoom(code)} title="Copy the link">${roomLink(code).replace(/^https?:\/\//, '')}</button>
          <div class="invite-btns two">
            <button type="button" class="primary big" onClick=${() => shareRoom(code)}>Share</button>
            <button type="button" class="big" onClick=${() => copyRoom(code)}>Copy link</button>
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
      <span class="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(i => html`<button key=${i} type="button" role="radio" aria-checked=${rating === i} aria-label=${`${i} star${i > 1 ? 's' : ''}`} class=${i <= rating ? 'on' : ''} onClick=${() => setRating(i)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8l-5.5 2.9 1.2-6.1-4.5-4.2 6.1-.8z" /></svg></button>`)}</span></div>
    ${rating ? html`<div class="row wrapgap"><span class="small">Would you play it again?</span>
      <button type="button" class=${'chipbtn sunk' + (again === true ? ' sel' : '')} onClick=${() => setAgain(true)}>Yes</button>
      <button type="button" class=${'chipbtn sunk' + (again === false ? ' sel' : '')} onClick=${() => setAgain(false)}>No</button></div>
    <div class="row wrapgap"><span class="chips">
      <button type="button" class=${'chipbtn sunk' + (kind === 'fix' ? ' sel' : '')} onClick=${() => setKind('fix')}>Something to fix</button>
      <button type="button" class=${'chipbtn sunk' + (kind === 'idea' ? ' sel' : '')} onClick=${() => setKind('idea')}>A game you want</button></span></div>
    <div class="row"><input class="grow" maxlength="300" onInput=${e => setText(e.target.value)} onKeyDown=${e => e.key === 'Enter' && submit()} placeholder=${kind === 'fix' ? 'What went wrong or felt off? (optional)' : 'Which game should we add? (optional)'} aria-label="Feedback" />
      <button class="primary" onClick=${submit}>Send</button></div>` : ''}
  </div>`
}

// ---------- chat ----------

function Chat() {
  const s = useStore()
  const box = useRef()
  const [v, setV] = useState('')
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [s.chat.length])
  const field = useRef()
  const submit = e => { e.preventDefault(); const t = (field.current?.value ?? '').trim(); if (!t) return; send({ t: 'chat', text: t }); field.current.value = ''; setV('') }
  return html`<aside class="chat" aria-label="Chat">
    <div class="chat-head"><b>Chat</b><button class="icon" onClick=${toggleChat} aria-label="Close chat">${ICONS.close}</button></div>
    <div class="chat-list" ref=${box}>${s.chat.length ? s.chat.map((c, i) => html`<div key=${i} class="msg"><${Avatar} id=${c.id} size=${28} /><span><${Name} id=${c.id} you=${false} /><span class="msg-text">${c.text}</span></span></div>`) : html`<p class="dim small">Say hi. Chat is handy for Imposter and Code Words discussions.</p>`}</div>
    <form class="answer" onSubmit=${submit}><input id="chat-in" ref=${field} onInput=${e => setV(e.target.value)} maxlength="200" placeholder="Message" autocomplete="off" aria-label="Chat message" /><button class="primary">Send</button></form>
  </aside>`
}

// The page arrives with the home page's welcome already drawn (for first paint and for search engines); the app takes
// over from there, so that copy goes first.
const root = document.getElementById('app')
root.replaceChildren()
render(html`<${App} />`, root)
countView()
