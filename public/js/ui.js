// Pieces every game screen uses: names, clocks, score lists, answer boxes and the drawing canvas.
import { html, useState, useEffect, useRef, useLayoutEffect } from './preact.js'
import { S, ME, now, onEvent } from './core.js'

export { html, useState, useEffect, useRef }

export const PLAYER_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#da77f2', '#ff922b', '#38d9a9', '#f783ac', '#a9e34b', '#748ffc', '#e599f7', '#ffa94d']
/** The same colours, dark enough to read as text on the light theme: at least 4.5:1 on white, the tinted rows
 *  (you, right, red and blue team) and Code Words' paper desk. */
export const PLAYER_INK = ['#a51d1d', '#145591', '#1a6229', '#6f5100', '#86289e', '#9a3209', '#085f53', '#a01a4a', '#3b5e08', '#2f49b8', '#8f2aa8', '#8d3f06']
export const INK = ['#111111', '#868e96', '#ffffff', '#e03131', '#f76707', '#fcc419', '#2f9e44', '#8ce99a', '#74c0fc', '#1971c2', '#7048e8', '#f06595', '#8b5a2b', '#f1c9a5', '#a61e4d', '#1b2a6b']
export const PEN = [3, 6, 12, 24, 48]

/** Re-renders the component every `ms` so clocks move. */
export function useTick(ms = 250) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t) }, [ms])
}

export const member = id => S.room?.members.find(m => m.id === id)
export const nameOf = id => member(id)?.name ?? 'Someone'
export const colorOf = id => PLAYER_COLORS[(member(id)?.color ?? 0) % PLAYER_COLORS.length]
const inkOf = id => PLAYER_INK[(member(id)?.color ?? 0) % PLAYER_INK.length]
/** The first letter of a name as a reader sees it: a whole emoji or a whole Devanagari letter, never half of one. */
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null
export const initialOf = id => { const n = nameOf(id).trim(); return ((seg ? seg.segment(n)[Symbol.iterator]().next().value?.segment : [...n][0]) ?? '?').toUpperCase() }
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** Small drawn marks the games use in place of emoji. */
export const Mark = {
  crown: () => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="mk crown"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" /></svg>`,
  flame: () => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="mk flame"><path d="M12 2c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9z" /></svg>`,
  pencil: () => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="mk line"><path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4" /></svg>`,
  stopwatch: () => html`<svg viewBox="0 0 48 48" aria-hidden="true" class="mk watch"><circle cx="24" cy="27" r="16" /><path d="M20 5h8M24 5v6M36 13l3-3" /><path d="M24 27V18" class="hand" /></svg>`,
}

export function Name({ id, you = true }) {
  return html`<b class="nm" style=${`--c:${colorOf(id)};--cd:${inkOf(id)}`}>${nameOf(id)}${you && id === ME ? html`<span class="dim"> (you)</span>` : ''}</b>`
}

/** A player's initial in their colour; `off` (away) leaves a dashed ring instead. */
export function Avatar({ id, size = 28, off = false }) {
  return html`<span class=${'av' + (off ? ' off' : '')} style=${`${off ? '' : `background:${colorOf(id)};`}width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`} aria-hidden="true">${initialOf(id)}</span>`
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Keyboard focus for a box that sits over the page (a sheet, a dialog, the room menu): focus moves into it when
 *  it opens (unless something inside already has it), Tab and Shift+Tab go round inside it, and focus goes back to
 *  where it was when it closes. `key` re-arms it for a box that stays mounted and changes content (the dialog). */
export function useFocusTrap(ref, key = true) {
  useEffect(() => {
    const box = ref.current
    if (!box || !key) return
    const back = document.activeElement
    const items = () => [...box.querySelectorAll(FOCUSABLE)].filter(e => e.offsetParent !== null || e === document.activeElement)
    if (!box.contains(document.activeElement)) (items()[0] ?? box).focus({ preventScroll: true })
    const onKey = e => {
      if (e.key !== 'Tab') return
      const list = items()
      if (!list.length) { e.preventDefault(); return }
      const first = list[0], last = list[list.length - 1], at = document.activeElement
      if (!box.contains(at)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); if (back?.isConnected) back.focus?.({ preventScroll: true }) }
  }, [key])
}

export const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`
}

/** Seconds left inside a ring that drains with them. The ring's full length is the time left when this deadline
 *  was first seen, so someone who joins mid-round sees a full ring that empties on time. */
export function Clock({ until }) {
  useTick(250)
  const span = useRef({ until: 0, total: 1 })
  if (!until) return null
  const left = Math.max(0, until - now())
  if (span.current.until !== until) span.current = { until, total: Math.max(left, 1000) }
  const text = fmt(left), gone = 100 - Math.min(1, left / span.current.total) * 100
  return html`<span class=${'clock' + (left < 5500 ? ' low' : '') + (text.length > 2 ? ' long' : '') + (text.length > 4 ? ' xl' : '')} role="timer" aria-label=${`${text} left`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="trk" cx="22" cy="22" r="19" /><circle class="arc" cx="22" cy="22" r="19" pathLength="100" style=${`stroke-dashoffset:${gone}`} /></svg><b>${text}</b></span>`
}

/** "Round 2 of 8" with a clock on the right. */
export function Head({ title, sub, until, children }) {
  return html`<div class="ghead"><div><div class="gtitle">${title}</div>${sub ? html`<div class="dim small">${sub}</div>` : ''}</div>${children}<${Clock} until=${until} /></div>`
}

/** Points won: "+10" in green, "+0" in grey. The one way every game shows them. */
export const Plus = ({ n = 0 }) => html`<b class=${'plus-pill' + (n > 0 ? '' : ' zero')}>+${n}</b>`

const MOVE_MS = 4500

/**
 * Players sorted by points, with an optional note per player (a tick for "answered"). Until someone scores there are no
 * places, only dashes. When a round moves people up or down, their rows slide to their new places and show how far
 * they moved, for a few seconds.
 */
export function Scores({ pts = {}, ids, note, gained }) {
  const list = (ids ?? S.room?.inst?.players ?? []).slice().sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0))
  const scored = list.some(id => (pts[id] ?? 0) !== 0)
  const places = {}
  list.forEach((id, i) => { places[id] = i > 0 && (pts[id] ?? 0) === (pts[list[i - 1]] ?? 0) ? places[list[i - 1]] : i + 1 })
  const box = useRef()
  const mem = useRef({ key: '', places: null, scored: false, moves: {}, until: 0, tops: {} })
  const [, force] = useState(0)
  const m = mem.current
  const key = list.map(id => `${id}:${pts[id] ?? 0}`).join()
  if (key !== m.key) {
    const moves = {}
    // Only a change of real places counts: going from "nobody has scored" to a first score moves nobody.
    if (m.places && m.scored) for (const id of list) if (m.places[id] && m.places[id] !== places[id]) moves[id] = m.places[id] - places[id]
    if (Object.keys(moves).length) { m.moves = moves; m.until = Date.now() + MOVE_MS }
    m.places = places
    m.scored = scored
    m.key = key
  }
  const moving = Date.now() < m.until ? m.moves : {}
  useEffect(() => { if (Date.now() >= m.until) return; const t = setTimeout(() => force(x => x + 1), m.until - Date.now() + 50); return () => clearTimeout(t) }, [m.until])
  // Rows that changed place slide from where they were (the order changed between two paints).
  useLayoutEffect(() => {
    const rows = box.current ? [...box.current.children] : []
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const tops = {}
    for (const li of rows) {
      const id = li.dataset.id, top = li.offsetTop
      tops[id] = top
      const was = m.tops[id]
      if (!still && was !== undefined && was !== top && li.animate) li.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }
    m.tops = tops
  })
  return html`<ol class="scores" ref=${box}>${list.map(id => {
    const mv = moving[id]
    return html`<li key=${id} data-id=${id} class=${id === ME ? 'me' : ''}><span class="pl">${scored ? places[id] : '–'}</span><${Avatar} id=${id} size=${24} /><span class="grow ell"><${Name} id=${id} /></span>
      ${mv ? html`<span class=${'mv ' + (mv > 0 ? 'up' : 'down')} aria-label=${`${mv > 0 ? 'up' : 'down'} ${plural(Math.abs(mv), 'place')}`}>${mv > 0 ? '▲' : '▼'}${Math.abs(mv)}</span>` : ''}
      ${note ? html`<span class="note">${note(id)}</span>` : ''}${gained ? html`<${Plus} n=${gained[id] ?? 0} />` : ''}<b class="pts">${pts[id] ?? 0}</b></li>`
  })}</ol>`
}

/** The line that opens every reveal, in every game: what happened in a few words, and what it meant for you. */
export const RevealHead = ({ head, sub }) => html`<div class="reveal-head" role="status"><b>${head}</b>${sub ? html`<span class="rh-sub">${sub}</span>` : ''}</div>`

/** "3 of 4 got it", the count that heads a reveal where there was one right answer. */
export const gotIt = (n, of) => (n === 0 ? 'Nobody got it' : n === of ? (of === 1 ? 'Got it!' : `All ${of} got it`) : `${n} of ${of} got it`)

/**
 * How a round ended, told the same way in every game with a round of scores: a headline (who took it), anything the
 * game wants to draw (`children`), then a row per player, best first, with a bar (longer is better), what they did, a
 * note and the points. Your row is marked.
 * rows: [{ id, value, bar: 0..1, note, pts, place, bad }]. With `totals` (everyone's points so far), each row shows the
 * player's total too, on phones, where this card stands in for the scoreboard while it is up.
 */
export function RoundResult({ head, sub, rows, totals, empty = 'Nobody played this round.', children }) {
  return html`<section class="rr" aria-label="How the round went">
    ${head ? html`<${RevealHead} head=${head} sub=${sub} />` : ''}
    ${children}
    ${rows.length ? html`<ol class="rr-rows">${rows.map((r, i) => html`<li key=${r.id} class=${(r.id === ME ? 'me' : '') + (r.bad ? ' bad' : '')} style=${`--i:${i}`}>
      <span class="rr-pl">${r.place ?? i + 1}</span><${Avatar} id=${r.id} size=${28} />
      <span class="rr-main"><span class="rr-line"><span class="ell"><${Name} id=${r.id} /></span><b class="rr-val">${r.value}</b></span>
        <span class="rr-bar" aria-hidden="true">${r.bad ? '' : html`<i style=${`--w:${Math.max(3, Math.round((r.bar ?? 0) * 100))}%`}></i>`}</span>
        ${r.note ? html`<span class="rr-note">${r.note}</span>` : ''}</span>
      <${Plus} n=${r.pts ?? 0} />${totals ? html`<b class="rr-total" aria-label=${`${totals[r.id] ?? 0} in total`}>${totals[r.id] ?? 0}</b>` : ''}</li>`)}</ol>` : html`<p class="dim center">${empty}</p>`}
  </section>`
}

/** Who has done the thing everyone is waiting for. */
export function Waiting({ ids, done, label = 'answered' }) {
  const n = ids.filter(id => done.includes(id)).length
  return html`<div class="waiting"><span class="dim small">${n}/${ids.length} ${label}</span>${ids.map(id => html`<span key=${id} class=${'chip' + (done.includes(id) ? ' on' : '')} title=${nameOf(id)}><${Avatar} id=${id} size=${20} />${done.includes(id) ? '✓' : ''}</span>`)}</div>`
}

/** A text box that sends on Enter. The page reads what is typed but never writes into the box while someone types:
 *  a phone keyboard that builds words as it goes (Gboard, Samsung) loses its place when the page sets the value, and
 *  the letters come out backwards. It is only cleared, after sending.
 *  Enter is caught on the box itself rather than left to the form: a browser will not send a form whose button is
 *  disabled, and on Android the button can still look empty when Enter lands (the word was still being built), so
 *  the keyboard just closed and the guess had to be sent by hand. The button is never disabled for being empty. */
export function AnswerBox({ onSend, placeholder = 'Type your answer', disabled, max = 60, keep = false, label = 'Send', mode = 'text', autoFocus = true }) {
  const [v, setV] = useState('')
  const ref = useRef()
  const clearAfter = useRef(false)
  useEffect(() => { if (autoFocus && !disabled && ref.current && matchMedia('(pointer: fine)').matches) ref.current.focus() }, [disabled])
  const submit = e => {
    e?.preventDefault()
    const t = (ref.current?.value ?? '').trim()
    if (!t || disabled) return
    onSend(t)
    if (!keep) { ref.current.value = ''; setV(''); clearAfter.current = true; setTimeout(() => { clearAfter.current = false }, 400) }
  }
  const key = e => { if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) submit(e) }
  // A keyboard that was still building the word can put it back after the box is cleared: clear it again.
  const composed = () => { if (clearAfter.current && ref.current) { ref.current.value = ''; setV('') } }
  const empty = !v.trim()
  return html`<form class="answer" onSubmit=${submit}>
    <input ref=${ref} onInput=${e => setV(e.target.value)} onKeyDown=${key} onCompositionEnd=${composed} maxlength=${max} placeholder=${placeholder} disabled=${disabled}
      inputmode=${mode === 'number' ? 'decimal' : 'text'} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label=${placeholder} />
    <button class=${'primary' + (empty ? ' empty' : '')} disabled=${disabled} aria-disabled=${empty ? 'true' : null}>${label}</button></form>`
}

// ---------- drawing ----------

function paint(ctx, s, from = 0) {
  const p = s.p
  ctx.strokeStyle = INK[s.c] ?? '#111'
  ctx.fillStyle = INK[s.c] ?? '#111'
  ctx.lineWidth = s.w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (p.length === 2) {
    ctx.beginPath()
    ctx.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const start = Math.max(0, from - 2)
  ctx.beginPath()
  ctx.moveTo(p[start], p[start + 1])
  for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
  ctx.stroke()
}

/**
 * A 1000 × 750 drawing. Viewers follow `strokes` from the state plus live pen events; the artist (`edit`) keeps
 * their own copy, seeded once per `k`, and sends what they draw in small batches.
 */
export function Canvas({ strokes = [], edit = false, live = false, send, k = 0, small = false }) {
  const ref = useRef()
  const st = useRef({ strokes: [], cur: null, buf: [], next: 1, k: null })
  const [color, setColor] = useState(0)
  const [size, setSize] = useState(1)
  const tool = useRef({ color: 0, size: 1 })
  tool.current = { color, size }

  const redraw = () => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 1000, 750)
    for (const s of st.current.strokes) paint(ctx, s)
  }
  const copy = list => list.map(s => ({ ...s, p: s.p.slice() }))

  // Seed (artist: once per k) or follow the state (viewers: every update).
  useEffect(() => {
    const me = st.current
    if (edit && me.k === k) return
    me.k = k
    me.strokes = copy(strokes)
    me.next = Math.max(0, ...me.strokes.map(s => s.id)) + 1
    redraw()
  }, [edit ? k : strokes, k])

  useEffect(() => {
    if (!live) return
    return onEvent(ev => {
      const me = st.current
      const ctx = ref.current?.getContext('2d')
      if (!ctx) return
      if (ev.k === 'line') {
        const last = me.strokes[me.strokes.length - 1]
        if (last && last.id === ev.id) { const from = last.p.length; last.p.push(...ev.p); paint(ctx, last, from) }
        else { const s = { id: ev.id, c: ev.c, w: ev.w, p: ev.p.slice() }; me.strokes.push(s); paint(ctx, s) }
      } else if (ev.k === 'undo') { me.strokes.pop(); redraw() }
      else if (ev.k === 'clear') { me.strokes = []; redraw() }
    })
  }, [live])

  // The artist's pen: batches go out every 60 ms.
  useEffect(() => {
    if (!edit) return
    const t = setInterval(() => flush(), 60)
    return () => { clearInterval(t); flush() }
  }, [edit])
  const flush = () => {
    const me = st.current
    if (!me.cur || !me.buf.length) return
    send({ a: 'line', id: me.cur.id, c: me.cur.c, w: me.cur.w, p: me.buf })
    me.buf = []
  }
  const pos = e => {
    const r = ref.current.getBoundingClientRect()
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 750)]
  }
  const down = e => {
    if (!edit) return
    e.preventDefault()
    ref.current.setPointerCapture(e.pointerId)
    flush()
    const me = st.current
    const [x, y] = pos(e)
    me.cur = { id: me.next++, c: tool.current.color, w: PEN[tool.current.size], p: [x, y] }
    me.strokes.push(me.cur)
    me.buf = [x, y]
    paint(ref.current.getContext('2d'), me.cur)
  }
  const move = e => {
    const me = st.current
    if (!edit || !me.cur || !(e.buttons || e.pointerType === 'touch')) return
    const [x, y] = pos(e)
    const p = me.cur.p
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 3) return
    p.push(x, y)
    me.buf.push(x, y)
    paint(ref.current.getContext('2d'), me.cur, p.length - 2)
    if (me.buf.length >= 380) flush()
  }
  const up = () => { flush(); st.current.cur = null }
  const undo = () => { flush(); st.current.cur = null; if (st.current.strokes.pop()) { redraw(); send({ a: 'undo' }) } }
  const clear = () => { flush(); st.current.cur = null; st.current.strokes = []; redraw(); send({ a: 'clear' }) }

  return html`<div class=${'canvas' + (small ? ' small' : '')}>
    <canvas ref=${ref} width="1000" height="750" class=${edit ? 'edit' : ''} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}></canvas>
    ${edit && html`<div class="tools">
      <div class="inks">${INK.map((c, i) => html`<button key=${i} class=${'ink' + (i === color ? ' sel' : '')} style=${`background:${c}`} onClick=${() => setColor(i)} aria-label=${i === 2 ? 'Eraser (white)' : `Colour ${i + 1}`}></button>`)}</div>
      <div class="row">
        ${PEN.map((w, i) => html`<button key=${w} class=${'pen' + (i === size ? ' sel' : '')} onClick=${() => setSize(i)} aria-label=${`Pen size ${i + 1}`}><i style=${`width:${Math.min(26, w / 1.6 + 3)}px;height:${Math.min(26, w / 1.6 + 3)}px`}></i></button>`)}
        <button class="pen" onClick=${() => setColor(2)} title="Eraser" aria-label="Eraser">⌫</button>
        <button onClick=${undo}>Undo</button><button onClick=${clear}>Clear</button>
      </div></div>`}
  </div>`
}
