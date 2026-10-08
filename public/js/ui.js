// Pieces every game screen uses: names, clocks, score lists, answer boxes and the drawing canvas.
import { html, useState, useEffect, useRef } from './preact.js'
import { S, ME, now, onEvent } from './core.js'

export { html, useState, useEffect, useRef }

export const PLAYER_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#da77f2', '#ff922b', '#38d9a9', '#f783ac', '#a9e34b', '#748ffc', '#e599f7', '#ffa94d']
/** The same colours, dark enough to read as text on the light theme. */
export const PLAYER_INK = ['#c92a2a', '#1864ab', '#2b8a3e', '#946c00', '#9c36b5', '#c2410c', '#0c7a6b', '#c2255c', '#5c940d', '#3b5bdb', '#ae3ec9', '#b45309']
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
  const n = nameOf(id)
  return html`<span class=${'av' + (off ? ' off' : '')} style=${`${off ? '' : `background:${colorOf(id)};`}width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`} aria-hidden="true">${n.slice(0, 1).toUpperCase()}</span>`
}

export const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`
}

export function Clock({ until }) {
  useTick(250)
  if (!until) return null
  const left = until - now()
  return html`<span class=${'clock' + (left < 5500 ? ' low' : '')} aria-label="Time left">${fmt(left)}</span>`
}

/** "Round 2 of 8" with a clock on the right. */
export function Head({ title, sub, until, children }) {
  return html`<div class="ghead"><div><div class="gtitle">${title}</div>${sub ? html`<div class="dim small">${sub}</div>` : ''}</div>${children}<${Clock} until=${until} /></div>`
}

/** Players sorted by points, with an optional note per player (a tick for "answered"). */
export function Scores({ pts = {}, ids, note, gained }) {
  const list = (ids ?? S.room?.inst?.players ?? []).slice().sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0))
  let place = 0
  return html`<ol class="scores">${list.map((id, i) => {
    if (i === 0 || (pts[id] ?? 0) !== (pts[list[i - 1]] ?? 0)) place = i + 1
    return html`<li key=${id} class=${id === ME ? 'me' : ''}><span class="pl">${place}</span><${Avatar} id=${id} size=${24} /><span class="grow ell"><${Name} id=${id} /></span>
      ${note ? html`<span class="note">${note(id)}</span>` : ''}${gained && gained[id] ? html`<span class="plus">+${gained[id]}</span>` : ''}<b class="pts">${pts[id] ?? 0}</b></li>`
  })}</ol>`
}

/** Who has done the thing everyone is waiting for. */
export function Waiting({ ids, done, label = 'answered' }) {
  const n = ids.filter(id => done.includes(id)).length
  return html`<div class="waiting"><span class="dim small">${n}/${ids.length} ${label}</span>${ids.map(id => html`<span key=${id} class=${'chip' + (done.includes(id) ? ' on' : '')} title=${nameOf(id)}><${Avatar} id=${id} size=${20} />${done.includes(id) ? '✓' : ''}</span>`)}</div>`
}

/** A text box that keeps its own value and sends on Enter. */
export function AnswerBox({ onSend, placeholder = 'Type your answer', disabled, max = 60, keep = false, label = 'Send', mode = 'text', autoFocus = true }) {
  const [v, setV] = useState('')
  const ref = useRef()
  useEffect(() => { if (autoFocus && !disabled && ref.current && matchMedia('(pointer: fine)').matches) ref.current.focus() }, [disabled])
  const submit = e => {
    e.preventDefault()
    const t = v.trim()
    if (!t || disabled) return
    onSend(t)
    if (!keep) setV('')
  }
  return html`<form class="answer" onSubmit=${submit}>
    <input ref=${ref} value=${v} onInput=${e => setV(e.target.value)} maxlength=${max} placeholder=${placeholder} disabled=${disabled}
      inputmode=${mode === 'number' ? 'decimal' : 'text'} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label=${placeholder} />
    <button class="primary" disabled=${disabled || !v.trim()}>${label}</button></form>`
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
