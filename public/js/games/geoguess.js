// GeoGuess: drag and zoom the world map, tap to drop a pin, lock it in. Map: Natural Earth (public domain), with
// India's borders as India draws them.
import { html, Head, Scores, Name, Waiting, colorOf, useState, useEffect, useRef } from '../ui.js'
import { act, ME } from '../core.js'

// Map units are tenths of a degree: x = (lon + 180) × 10, y = (90 − lat) × 10. Antarctica is left out.
const FULL = [0, 60, 3600, 1440]
const toXY = p => [(p.lon + 180) * 10, (90 - p.lat) * 10]
const toLL = (x, y) => ({ lon: Math.max(-180, Math.min(180, x / 10 - 180)), lat: Math.max(-90, Math.min(90, 90 - y / 10)) })
let world = null
const loadWorld = () => (world ??= fetch('/geo/world.json').then(r => r.json()))

function clampView([x, y, w, h]) {
  w = Math.max(60, Math.min(FULL[2], w)); h = w * (FULL[3] / FULL[2])
  x = Math.max(FULL[0] - w * 0.25, Math.min(FULL[0] + FULL[2] - w * 0.75, x))
  y = Math.max(FULL[1] - h * 0.25, Math.min(FULL[1] + FULL[3] - h * 0.75, y))
  return [x, y, w, h]
}

function fit(points) {
  if (!points.length) return FULL
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const pad = 120
  let w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2
  w = Math.max(w, h * (FULL[2] / FULL[3]), 300)
  h = w * (FULL[3] / FULL[2])
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
  return clampView([cx - w / 2, cy - h / 2, w, h])
}

function WorldMap({ pin, onPin, reveal, round }) {
  const [paths, setPaths] = useState(null)
  const [view, setView] = useState(FULL)
  const svg = useRef()
  const drag = useRef(null)
  const pointers = useRef(new Map())
  useEffect(() => { loadWorld().then(setPaths) }, [])
  useEffect(() => { setView(FULL) }, [round])
  useEffect(() => {
    if (!reveal) return
    const pts = [toXY(reveal.answer), ...Object.values(reveal.pins).map(toXY)]
    setView(fit(pts))
  }, [!!reveal])

  const at = e => {
    const r = svg.current.getBoundingClientRect()
    return [view[0] + ((e.clientX - r.left) / r.width) * view[2], view[1] + ((e.clientY - r.top) / r.height) * view[3]]
  }
  const zoom = (f, cx, cy) => setView(v => {
    cx ??= v[0] + v[2] / 2; cy ??= v[1] + v[3] / 2
    const w = Math.max(60, Math.min(FULL[2], v[2] * f)), k = w / v[2]
    return clampView([cx - (cx - v[0]) * k, cy - (cy - v[1]) * k, w, v[3] * k])
  })
  const down = e => {
    svg.current.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, [e.clientX, e.clientY])
    drag.current = { x: e.clientX, y: e.clientY, view, moved: 0, pinch: pointers.current.size === 2 ? dist() : 0 }
  }
  const dist = () => { const [a, b] = [...pointers.current.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) }
  const move = e => {
    if (!drag.current || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, [e.clientX, e.clientY])
    const d = drag.current
    if (pointers.current.size === 2) {
      const now = dist()
      if (d.pinch) { const [cx, cy] = at(e); zoom(d.pinch / now, cx, cy); d.pinch = now }
      d.moved = 99
      return
    }
    const r = svg.current.getBoundingClientRect()
    const dx = ((e.clientX - d.x) / r.width) * d.view[2], dy = ((e.clientY - d.y) / r.height) * d.view[3]
    d.moved = Math.max(d.moved, Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y))
    if (d.moved > 6) setView(clampView([d.view[0] - dx, d.view[1] - dy, d.view[2], d.view[3]]))
  }
  const up = e => {
    const d = drag.current
    pointers.current.delete(e.pointerId)
    if (d && d.moved <= 6 && pointers.current.size === 0 && onPin) { const [x, y] = at(e); onPin(toLL(x, y)) }
    if (pointers.current.size === 0) drag.current = null
  }
  const wheel = e => { e.preventDefault(); const [cx, cy] = at(e); zoom(e.deltaY > 0 ? 1.25 : 0.8, cx, cy) }
  useEffect(() => { const el = svg.current; el?.addEventListener('wheel', wheel, { passive: false }); return () => el?.removeEventListener('wheel', wheel) })

  const r = view[2] / 110
  const shape = reveal?.answer.shape
  return html`<div class="geo-map">
    <svg ref=${svg} viewBox=${view.join(' ')} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} role="img" aria-label="World map. Drag to move, pinch or scroll to zoom, tap to drop your pin.">
      <rect x="-2000" y="-2000" width="8000" height="6000" class="geo-sea" />
      ${paths ? paths.map(p => html`<path key=${p.n} d=${p.d} class=${'geo-land' + (shape && p.n === shape ? ' hit' : '')} vector-effect="non-scaling-stroke" />`) : ''}
      ${reveal ? Object.entries(reveal.pins).map(([id, p]) => {
        const [x, y] = toXY(p), [ax, ay] = toXY(reveal.answer)
        return html`<g key=${id}>${reveal.answer.kind !== 'country' ? html`<line x1=${x} y1=${y} x2=${ax} y2=${ay} class="geo-line" vector-effect="non-scaling-stroke" />` : ''}
          <circle cx=${x} cy=${y} r=${r} fill=${colorOf(id)} class="geo-pin" vector-effect="non-scaling-stroke" /></g>`
      }) : ''}
      ${reveal && reveal.answer.kind !== 'country' ? html`<circle cx=${toXY(reveal.answer)[0]} cy=${toXY(reveal.answer)[1]} r=${r * 1.3} class="geo-target" vector-effect="non-scaling-stroke" />` : ''}
      ${pin && !reveal ? html`<circle cx=${toXY(pin)[0]} cy=${toXY(pin)[1]} r=${r} fill=${colorOf(ME)} class="geo-pin" vector-effect="non-scaling-stroke" />` : ''}
    </svg>
    <div class="geo-zoom"><button onClick=${() => zoom(0.6)} aria-label="Zoom in">+</button><button onClick=${() => zoom(1.6)} aria-label="Zoom out">−</button><button onClick=${() => setView(FULL)} aria-label="Whole world">⟲</button></div>
    ${!paths ? html`<div class="geo-loading dim">Loading the map…</div>` : ''}
  </div>`
}

const ASK = { country: 'Find the country', capital: 'Find the capital city', city: 'Find the city' }

export default function GeoGuess({ v, inst, seated }) {
  const [pin, setPin] = useState(null)
  useEffect(() => setPin(null), [v.round])
  const reveal = v.phase === 'reveal'
  const locked = v.mine !== null
  const rows = reveal ? Object.entries(v.result).sort((a, b) => b[1].pts - a[1].pts) : []
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Place ${v.round + 1} of ${v.rounds}`} sub=${ASK[v.kind]} until=${v.until} />
      <div class="geo-ask"><span class="dim small">${ASK[v.kind]}</span><b>${v.name}</b>${reveal && v.answer.of && v.kind !== 'country' ? html`<span class="dim small">${v.answer.of}</span>` : ''}</div>
      <${WorldMap} round=${v.round} pin=${locked ? v.mine : pin} onPin=${seated && !locked && !reveal ? setPin : null}
        reveal=${reveal ? { answer: { ...v.answer, kind: v.kind }, pins: v.pins } : null} />
      ${!reveal && seated ? html`<div class="row center-row">${locked ? html`<span class="plus">Pin locked. Waiting for the others…</span>`
        : html`<span class="dim small">${pin ? 'Tap again to move it.' : 'Tap the map to drop your pin.'}</span><button class="primary" disabled=${!pin} onClick=${() => act({ a: 'pin', lat: pin.lat, lon: pin.lon })}>Lock in</button>`}</div>` : ''}
      ${reveal ? html`<table class="tbl">${rows.map(([id, r], i) => html`<tr key=${id}><td>${i + 1}</td><td><${Name} id=${id} /></td><td>${r.km === 0 ? 'inside!' : `${r.km.toLocaleString('en-IN')} km`}</td><td class="plus">+${r.pts}</td></tr>`)}</table>
        ${!rows.length ? html`<p class="dim center">Nobody dropped a pin.</p>` : ''}` : html`<${Waiting} ids=${inst.players} done=${v.pinned} label="locked in" />`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? Object.fromEntries(rows.map(([id, r]) => [id, r.pts])) : null} />
      <p class="dim small">100 for a pin inside the country or on the city. Points fall with distance.</p></aside>
  </div>`
}
