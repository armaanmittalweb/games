// Last Card: an Uno-style card game. Cards arrive as two-letter codes: colour (r y g b, x = wild) and value.
// Every move also arrives as a numbered effect (v.fx), so each screen plays the same beat: the card flies from the
// player to the pile, draws fly from the deck, and skips, reverses, +2/+4, calls and catches get their own moment.
import { html, useState, useEffect, useRef, Name, Avatar, Clock, nameOf } from '../ui.js'
import { useLayoutEffect } from '../preact.js'
import { act, ME, now, local } from '../core.js'

const COL = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue' }
const HEX = { r: '#e5383b', y: '#f5b700', g: '#2fa84f', b: '#1f6fe0' }
const CHIP = { r: ['#cc2b2e', '#fff'], y: ['#f5b700', '#15161a'], g: ['#2fa84f', '#15161a'], b: ['#1f6fe0', '#fff'] }
const NAMES = { s: 'Skip', r: 'Reverse', d: 'Draw two', w: 'Wild', f: 'Wild draw four' }
const isWild = c => c[1] === 'w' || c[1] === 'f'
const say = c => isWild(c) ? `${NAMES[c[1]]}${COL[c[0]] ? `, ${COL[c[0]]}` : ''}` : `${COL[c[0]]} ${NAMES[c[1]] ?? c[1]}`
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- card art ----------
const SKIP = html`<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="12.5" fill="none" stroke="currentColor" stroke-width="5" /><path d="M11.5 28.5 28.5 11.5" stroke="currentColor" stroke-width="5" /></svg>`
const REV = html`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 15h19l-5.5-5.5M31 25H12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" /></svg>`
const PLUS2 = html`<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="5" width="15" height="22" rx="3" fill="currentColor" stroke="#fff" stroke-width="2" /><rect x="17" y="13" width="15" height="22" rx="3" fill="currentColor" stroke="#fff" stroke-width="2" /></svg>`
const PLUS4 = html`<svg viewBox="0 0 40 40" aria-hidden="true">${[['r', 3, 13], ['y', 10, 6], ['g', 17, 15], ['b', 24, 8]].map(([k, x, y]) => html`<rect key=${k} x=${x} y=${y} width="12" height="18" rx="2.5" fill=${HEX[k]} stroke="#fff" stroke-width="1.8" />`)}</svg>`

function Face({ c }) {
  const v = c[1]
  if (v === 'w') return ''
  if (v === 'f') return html`<span class="lc-sym">${PLUS4}</span>`
  if (v === 's') return html`<span class="lc-sym">${SKIP}</span>`
  if (v === 'r') return html`<span class="lc-sym">${REV}</span>`
  if (v === 'd') return html`<span class="lc-sym">${PLUS2}</span>`
  return html`<span class=${'lc-num' + (v === '6' || v === '9' ? ' u' : '')}>${v}</span>`
}
const corner = c => ({ s: SKIP, r: REV, d: '+2', f: '+4', w: 'W' })[c[1]] ?? c[1]

export function Card({ c, small, ok, dim, onClick, style, extra = '' }) {
  const wild = isWild(c)
  const cls = `lc${wild ? ' wild' : ''}${wild && COL[c[0]] ? ' chosen' : ''}${small ? ' sm' : ''}${ok ? ' ok' : ''}${dim ? ' dimc' : ''}${extra ? ' ' + extra : ''}`
  const k = wild ? HEX[c[0]] ?? '#1b1b1f' : HEX[c[0]]
  return html`<button class=${cls} style=${`--k:${k};${style ?? ''}`} onClick=${onClick} disabled=${!onClick}><span class="vh">${say(c)}</span>
    <span class="lc-face" aria-hidden="true"><i class="lc-oval"></i><span class="lc-mid"><${Face} c=${c} /></span>
    ${small ? '' : html`<span class="lc-corner tl">${corner(c)}</span><span class="lc-corner br">${corner(c)}</span>`}</span></button>`
}
const Back = ({ cls = '', style }) => html`<i class=${'lc-back ' + cls} style=${style} aria-hidden="true"><b>LAST<br />CARD</b></i>`

// ---------- sound ----------
let ac = null
function audio() {
  try { ac ??= new AudioContext(); if (ac.state === 'suspended') ac.resume(); return ac } catch { return null }
}
function tone(f, at, dur, type = 'triangle', vol = 0.07, to) {
  const a = audio(); if (!a) return
  const t = a.currentTime + at, o = a.createOscillator(), gn = a.createGain()
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(gn).connect(a.destination); o.start(t); o.stop(t + dur + 0.02)
}
function swish(at = 0, freq = 2600, vol = 0.12, dur = 0.07) {
  const a = audio(); if (!a) return
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2
  const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain()
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; gn.gain.value = vol
  s.connect(f).connect(gn).connect(a.destination); s.start(a.currentTime + at)
}
const SFX = {
  card: () => { swish(0, 2800); tone(140, 0.05, 0.08, 'sine', 0.09) },
  draw: () => swish(0, 1500, 0.08, 0.05),
  turn: () => { tone(660, 0, 0.09); tone(990, 0.08, 0.14) },
  skip: () => tone(520, 0, 0.16, 'square', 0.035, 240),
  rev: () => { tone(440, 0, 0.08); tone(660, 0.07, 0.08); tone(440, 0.14, 0.1) },
  hit: () => { tone(260, 0, 0.25, 'sawtooth', 0.05, 90); swish(0, 600, 0.1, 0.15) },
  wild: () => [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.05, 0.16, 'sine', 0.05)),
  call: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.15, 'square', 0.035)),
  catch: () => { tone(880, 0, 0.08, 'square', 0.04); tone(330, 0.09, 0.25, 'sawtooth', 0.05, 160) },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.07)),
}

// ---------- motion ----------
function layer() {
  let el = document.getElementById('lc-fly')
  if (!el) { el = document.createElement('div'); el.id = 'lc-fly'; document.body.append(el) }
  return el
}
/** Fly a copy of `node` (at its own unrotated size) from the centre of rect `a` to the centre of rect `b`. */
function fly(node, a, b, { delay = 0, dur = 480, spin = 0, from = 0.6, to = 1, rot = 0, fade = false } = {}) {
  if (!node || !a || !b || still()) return Promise.resolve()
  const w = node.offsetWidth, h = node.offsetHeight
  const el = node.cloneNode(true)
  el.classList.add('flying')
  el.classList.remove('top', 'land', 'under', 'stacked')
  el.style.visibility = ''
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2
  Object.assign(el.style, { left: cx - w / 2 + 'px', top: cy - h / 2 + 'px', width: w + 'px', height: h + 'px' })
  el.style.setProperty('--cw', w + 'px')
  layer().append(el)
  const dx = a.left + a.width / 2 - cx, dy = a.top + a.height / 2 - cy
  const anim = el.animate([
    { transform: `translate(${dx}px,${dy}px) rotate(${spin}deg) scale(${from})`, opacity: 0.9 },
    { transform: `translate(${dx * 0.35}px,${dy * 0.35 - 40}px) rotate(${(spin + rot) / 2}deg) scale(${Math.max(from, to) * 1.1})`, opacity: 1, offset: 0.6 },
    { transform: `translate(0px,0px) rotate(${rot}deg) scale(${to})`, opacity: fade ? 0 : 1 },
  ], { duration: dur, delay, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' })
  return anim.finished.then(() => el.remove(), () => el.remove())
}
function confetti(box) {
  if (still()) return
  const L = layer(), colors = [...Object.values(HEX), '#ffffff', '#ff8fd1']
  const x0 = box ? box.left + box.width / 2 : innerWidth / 2, y0 = box ? box.top + box.height / 2 : innerHeight / 2
  for (let i = 0; i < 110; i++) {
    const p = document.createElement('i')
    p.className = 'lc-conf'
    p.style.cssText = `left:${x0}px;top:${y0}px;background:${colors[i % colors.length]};${i % 3 ? '' : 'border-radius:50%;'}`
    L.append(p)
    const ang = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 320
    const dx = Math.cos(ang) * sp, dy = Math.sin(ang) * sp - 160
    p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx * 1.3}px,${dy + 420}px) rotate(${Math.random() * 1080}deg)`, opacity: 0 },
    ], { duration: 1800 + Math.random() * 900, easing: 'cubic-bezier(.15,.6,.4,1)' }).finished.then(() => p.remove(), () => p.remove())
  }
}
const buzz = ms => { try { navigator.vibrate?.(ms) } catch { /* not supported */ } }

/** A small fixed tilt for a card on the pile, so it keeps its angle as more cards land on it. */
const tilt = c => { let h = 7; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 997; return (h % 25) - 12 }

// ---------- pieces ----------
function Ring({ until, total }) {
  const left = Math.max(0, until - now())
  return html`<svg class="lc-ring" viewBox="0 0 50 50" aria-hidden="true"><circle key=${until} cx="25" cy="25" r="23" pathLength="100"
    style=${`animation-duration:${left}ms;stroke-dashoffset:${Math.max(0, 100 - (left / total) * 100)}`} /></svg>`
}

const Pops = ({ list }) => list.map(p => html`<span key=${p.key} class=${'lc-pop ' + p.cls}>${p.text}</span>`)

function Seat({ id, v, pops, total }) {
  const turn = v.turn === id && !v.winner, n = v.counts[id] ?? 0, shown = Math.min(n, 9)
  return html`<div class=${'lc-seat' + (turn ? ' turn' : '') + (v.winner === id ? ' won' : '') + (n === 1 ? ' one' : '')} data-seat=${id}>
    <div class="lc-av"><${Avatar} id=${id} size=${40} />${turn ? html`<${Ring} until=${v.until} total=${total} />` : ''}</div>
    <div class="ell small lc-nm"><${Name} id=${id} /></div>
    <div class="lc-minifan" aria-label=${`${n} card${n === 1 ? '' : 's'}`}>
      ${Array.from({ length: shown }, (_, i) => html`<${Back} key=${i} cls="mini" style=${`--a:${(i - (shown - 1) / 2) * 9}deg`} />`)}
      <b class="lc-count">${n}</b></div>
    ${v.called[id] && n <= 2 ? html`<span class="lc-tag">Last card!</span>` : ''}
    ${v.exposed === id ? html`<button class="lc-catch" onClick=${() => act({ a: 'catch' })}>Catch! +2</button>` : ''}
    <${Pops} list=${pops} />
  </div>`
}

const ORDER = 'rygbx', RANK = '0123456789srdwf'
function useWidth(ref) {
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return w
}

function Hand({ v, myTurn, sorted, onPlay, handRef }) {
  const w = useWidth(handRef)
  const first = useRef(true)
  useEffect(() => { first.current = false }, [])
  const seen = {}
  const cards = v.hand.map((c, i) => ({ c, i, key: c + '.' + (seen[c] = (seen[c] ?? 0) + 1) }))
  if (sorted) cards.sort((a, b) => ORDER.indexOf(a.c[0]) - ORDER.indexOf(b.c[0]) || RANK.indexOf(a.c[1]) - RANK.indexOf(b.c[1]))
  const n = cards.length, cw = w < 520 ? 62 : 80
  // The outer cards tilt out past their slot, so keep about half a card free at each end.
  const step = n > 1 ? Math.max(26, Math.min(cw + 8, (w - cw * 1.6 - 16) / (n - 1))) : 0
  const spread = Math.min(4, 36 / Math.max(n, 1)), mid = (n - 1) / 2
  return html`<div class=${'lc-hand' + (myTurn ? ' mine' : '')} ref=${handRef} style=${`--cw:${cw}px`}>
    ${cards.map(({ c, i, key }, j) => {
      const off = j - mid
      const style = `--a:${(off * spread).toFixed(2)}deg;--y:${(off * off * spread * 0.32).toFixed(1)}px;--d:${first.current ? j * 55 : 0}ms;margin-left:${j ? (step - cw).toFixed(1) : 0}px;z-index:${j + 1}`
      return html`<${Card} key=${key} c=${c} style=${style} ok=${v.playable[i]} dim=${myTurn && !v.playable[i]}
        onClick=${myTurn && v.playable[i] ? e => onPlay(i, e.currentTarget) : null} />`
    })}
  </div>`
}

function WildPicker({ onPick, onClose }) {
  return html`<div class="modal" onClick=${e => e.target === e.currentTarget && onClose()}>
    <div class="card stack center lc-pick"><b>Pick the next colour</b>
      <div class="lc-wheelpick">${Object.entries(COL).map(([k, n]) => html`<button key=${k} class=${'q-' + k} style=${`--k:${HEX[k]}`} onClick=${() => onPick(k)}>${n}</button>`)}</div>
      <button class="lc-tbtn" onClick=${onClose}>Cancel</button></div></div>`
}

// ---------- the table ----------
export default function LastCard({ v }) {
  const root = useRef(null), deckRef = useRef(null), topRef = useRef(null), handRef = useRef(null), tableRef = useRef(null)
  const [wildAt, setWildAt] = useState(null)
  const [pops, setPops] = useState([])
  const [riffle, setRiffle] = useState(0)
  const [spin, setSpin] = useState(0)
  const [shake, setShake] = useState(false)
  const [sorted, setSorted] = useState(() => local.get('lc.sort', '1') === '1')
  const [muted, setMuted] = useState(() => local.get('lc.mute', '0') === '1')
  const seenFx = useRef(null), playedFrom = useRef(null), turnWas = useRef(null), total = useRef({ until: 0, ms: 30000 })
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const myTurn = v.turn === ME && !v.winner
  const sfx = k => { if (!mutedRef.current) SFX[k]() }

  // The clock ring needs the length of the whole turn; take it from when the turn started.
  if (v.until !== total.current.until) total.current = { until: v.until, ms: Math.max(1000, v.until - now()) }

  const pop = (at, text, cls = '', ms = 1500) => {
    const key = Math.random().toString(36).slice(2)
    setPops(p => [...p, { key, at, text, cls }])
    setTimeout(() => setPops(p => p.filter(x => x.key !== key)), ms)
  }
  const jolt = pattern => { setShake(true); setTimeout(() => setShake(false), 520); buzz(pattern) }
  const seatRect = id => id === ME
    ? handRef.current?.getBoundingClientRect()
    : root.current?.querySelector(`[data-seat="${id}"] .lc-minifan`)?.getBoundingClientRect()
  const lastFx = v.fx?.length ? v.fx[v.fx.length - 1].n : 0

  useLayoutEffect(() => {
    const list = v.fx ?? []
    if (seenFx.current === null) { seenFx.current = lastFx; return }
    const fresh = list.filter(e => e.n > seenFx.current)
    if (!fresh.length) return
    seenFx.current = lastFx
    let t = 0
    for (const e of fresh) {
      const at = t
      if (e.k === 'play') {
        const top = topRef.current?.querySelector('.lc.top')
        const from = e.by === ME ? playedFrom.current ?? seatRect(ME) : seatRect(e.by)
        playedFrom.current = null
        if (top && !still()) {
          top.style.visibility = 'hidden'
          top.classList.remove('land')
          fly(top, from, topRef.current.getBoundingClientRect(), { delay: at, spin: e.by === ME ? 0 : 220, from: e.by === ME ? 0.85 : 0.45, rot: tilt(v.top) })
            .then(() => { top.style.visibility = ''; void top.offsetWidth; top.classList.add('land') })
        }
        setTimeout(() => {
          sfx('card')
          const val = e.c[1]
          if (val === 'w' || val === 'f') { sfx('wild'); pop('table', COL[e.c[0]], 'ripple', 1100) }
          if (e.skip) { sfx('skip'); pop(e.skip, html`${SKIP}<span>Skipped</span>`, 'stamp', 1500) }
          if (e.rev) { sfx('rev'); setSpin(s => s + 1); pop('table', html`${REV}<span>Reverse</span>`, 'banner', 1300) }
          if (e.hit) {
            setTimeout(() => sfx('hit'), 120)
            pop(e.hit, `+${e.drew ?? e.owed}`, 'hit', 1600)
            if (e.owed && e.owed > (val === 'd' ? 2 : 4)) pop('table', `Stacked! +${e.owed}`, 'banner hot', 1600)
            if (e.hit === ME) jolt([60, 40, 90])
          }
          if (e.last) {
            pop('table', html`<${Avatar} id=${e.by} size=${30} /><span>${e.by === ME ? 'You win!' : `${nameOf(e.by)} wins!`}</span>`, 'banner win', 2600)
            sfx('win'); confetti(tableRef.current?.getBoundingClientRect()); buzz(200)
          }
        }, at + (still() ? 0 : 470))
        t += 260
      } else if (e.k === 'draw') {
        const to = seatRect(e.by), back = deckRef.current?.querySelector('.lc-back.top'), deck = deckRef.current?.getBoundingClientRect()
        const n = Math.min(e.drew, 6)
        for (let i = 0; i < n; i++) {
          fly(back, deck, to, { delay: at + i * 110, dur: 420, from: 1, to: e.by === ME ? 0.8 : 0.3, fade: true })
          setTimeout(() => sfx('draw'), at + i * 110)
        }
        if (e.drew > 1) pop(e.by, `+${e.drew}`, 'plus', 1200)
        t += n * 110
      } else if (e.k === 'call') {
        sfx('call'); pop(e.by, 'LAST CARD!', 'shout', 1700)
      } else if (e.k === 'catch') {
        sfx('catch'); pop(e.who, html`Caught! <b>+2</b>`, 'stamp caught', 1700)
        if (e.who === ME) jolt([80, 50, 80])
      } else if (e.k === 'shuffle') {
        setRiffle(r => r + 1); pop('deck', 'Shuffled', 'mini-pop', 1000)
      }
    }
  }, [lastFx])

  useEffect(() => {
    if (myTurn && turnWas.current !== null && turnWas.current !== ME) { sfx('turn'); buzz(25) }
    turnWas.current = v.winner ? null : v.turn
  }, [v.turn, myTurn])

  const play = (i, el) => {
    playedFrom.current = el?.getBoundingClientRect() ?? null
    if (v.hand[i][0] === 'x') return setWildAt(i)
    act({ a: 'play', i })
  }
  const toggle = (k, val, set) => { set(val); local.set(k, val ? '1' : '0') }
  // Opponents sit in turn order starting after me, so the direction arrows read naturally.
  const mine = v.order.indexOf(ME)
  const seats = mine < 0 ? v.order : [...v.order.slice(mine + 1), ...v.order.slice(0, mine)]
  const at = id => pops.filter(p => p.at === id)
  const pileDepth = Math.min(5, Math.ceil(v.pile / 15))

  return html`<div class=${'lcg2' + (shake ? ' shook' : '')} ref=${root}>
    <div class="lc-seats">${seats.map(id => html`<${Seat} key=${id} id=${id} v=${v} pops=${at(id)} total=${total.current.ms} />`)}</div>

    <div class=${'lc-table' + (v.winner ? ' over' : '')} ref=${tableRef} style=${`--cur:${HEX[v.color]}`}>
      <svg class=${'lc-dir' + (v.dir < 0 ? ' ccw' : '') + (spin ? ' flip' : '')} key=${'d' + spin} viewBox="0 0 200 200" preserveAspectRatio="none" role="img" aria-label=${v.dir === 1 ? 'Play goes clockwise' : 'Play goes anticlockwise'}>
        <g class="lc-dir-spin"><circle cx="100" cy="100" r="90" />
          ${[0, 120, 240].map(r => html`<path key=${r} transform=${`rotate(${r} 100 100)${v.dir < 0 ? ' scale(-1 1) translate(-200 0)' : ''}`} d="M94 2 L110 10 L94 18 Z" />`)}</g></svg>
      <button class=${'lc-deck' + (myTurn && !v.drawn ? ' can' : '') + (riffle ? ' riffle' : '')} key=${'r' + riffle} ref=${deckRef}
        onClick=${() => myTurn && !v.drawn && act({ a: 'draw' })} disabled=${!myTurn || !!v.drawn}><span class="vh">Draw a card, ${v.pile} left</span>
        ${Array.from({ length: pileDepth }, (_, i) => html`<${Back} key=${i} cls="stacked" style=${`--i:${pileDepth - i}`} />`)}
        <${Back} cls="top" />
        <span class="lc-deck-n" aria-hidden="true">${v.pile}</span>
        <${Pops} list=${at('deck')} />
      </button>
      <div class="lc-discard" ref=${topRef}>
        ${(v.under ?? []).map((c, i) => html`<${Card} key=${'u' + i} c=${c} extra="under" style=${`--t:${tilt(c)}deg`} />`)}
        <${Card} key="top" c=${v.top} extra="top" style=${`--t:${tilt(v.top)}deg`} />
      </div>
      <div class="lc-now">
        <span class="lc-chip" style=${`--k:${CHIP[v.color][0]};color:${CHIP[v.color][1]}`}>${COL[v.color]}</span>
        ${v.owed ? html`<span class="lc-chip owe">+${v.owed} waiting</span>` : ''}
        ${v.winner ? '' : html`<${Clock} until=${v.until} />`}
      </div>
      <${Pops} list=${at('table')} />
    </div>

    ${mine >= 0 ? html`
      <div class=${'lc-me' + (myTurn ? ' turn' : '')}>
        <div class="lc-say">${v.winner
          ? html`<${Name} id=${v.winner} /> is out of cards!`
          : myTurn
            ? html`<b>Your turn.</b> ${v.owed ? `Stack a draw card or take ${v.owed}.` : v.drawn ? 'Play the card you drew, or keep it.' : 'Match the colour or the number.'}`
            : html`<${Name} id=${v.turn} />'s turn${v.owed ? `, owes ${v.owed}` : ''}`}</div>
        <div class="lc-handwrap"><${Hand} v=${v} myTurn=${myTurn} sorted=${sorted} onPlay=${play} handRef=${handRef} /><${Pops} list=${at(ME)} /></div>
        <div class="lc-actions">
          ${myTurn && v.owed ? html`<button class="danger" onClick=${() => act({ a: 'draw' })}>Take ${v.owed}</button>` : ''}
          ${myTurn && !v.owed && !v.drawn ? html`<button onClick=${() => act({ a: 'draw' })}>Draw a card</button>` : ''}
          ${myTurn && v.drawn ? html`<button onClick=${() => act({ a: 'pass' })}>Keep it and pass</button>` : ''}
          ${v.hand.length <= 2 && !v.called[ME] && !v.winner ? html`<button class=${'lc-call' + (v.exposed === ME ? ' urgent' : '')} onClick=${() => act({ a: 'last' })}>Last card!</button>` : ''}
          ${v.called[ME] && v.hand.length <= 2 && !v.winner ? html`<span class="lc-tag">Called ✓</span>` : ''}
        </div>
        ${v.exposed === ME ? html`<p class="lc-warn">One card and you haven't called it. Tap <b>Last card!</b> before someone catches you.</p>` : ''}
        <div class="lc-tools">
          <button class="lc-tbtn" onClick=${() => toggle('lc.sort', !sorted, setSorted)}>${sorted ? 'Sorted by colour' : 'As dealt'}</button>
          <button class="lc-tbtn" onClick=${() => toggle('lc.mute', !muted, setMuted)}>${muted ? 'Sound off' : 'Sound on'}</button>
        </div>
      </div>` : ''}

    <div class="lc-log small dim">${v.log.slice(-3).reverse().map((l, i) => html`<div key=${l + i} style=${`opacity:${1 - i * 0.28}`}>${line(l)}</div>`)}</div>
    ${wildAt !== null ? html`<${WildPicker} onClose=${() => setWildAt(null)} onPick=${k => { act({ a: 'play', i: wildAt, color: k }); setWildAt(null) }} />` : ''}
  </div>`
}

/** Log lines mention cards as {r7}. */
const line = text => text.split(/(\{[a-z0-9]{2}\})/).map(part => (part.startsWith('{') ? html`<${Card} c=${part.slice(1, 3)} small=${true} />` : part))

export function Summary({ inst, summary }) {
  if (!summary?.hands) return null
  return html`<div class="card"><h2>Cards left</h2>${inst.players.filter(id => summary.hands[id]?.length).map(id => html`<div key=${id} class="row wrapgap" style="margin:6px 0"><span style="min-width:90px"><${Name} id=${id} /></span>${summary.hands[id].map((c, i) => html`<${Card} key=${i} c=${c} small=${true} />`)}</div>`)}</div>`
}
