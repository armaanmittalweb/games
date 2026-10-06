// GeoGuess: drag and zoom the world map, tap to drop a pin, lock it in. Then the answer is flown to and marked, with
// a line from every pin to it. The map itself is in geomap.js.
import { html, Head, Scores, Name, Waiting, colorOf, nameOf, useState, useEffect, useRef } from '../ui.js'
import { act, ME } from '../core.js'
import { GeoMap } from './geomap.js'

const initial = id => nameOf(id).trim().slice(0, 1).toUpperCase() || '?'
const far = km => (km === 0 ? 'inside!' : `${km.toLocaleString('en-IN')} km`)

function WorldMap({ pin, onPin, reveal }) {
  const cv = useRef()
  const map = useRef()
  useEffect(() => {
    map.current = new GeoMap(cv.current)
    return () => map.current.destroy()
  }, [])
  useEffect(() => { map.current.set({ pin, onPin, reveal }) })
  return html`<div class="geo-map">
    <canvas ref=${cv} tabindex="0" role="application" aria-label="World map. Drag to move, pinch or scroll to zoom, tap to drop your pin. Arrow keys move, plus and minus zoom, Enter drops a pin in the middle."></canvas>
    <div class="geo-zoom">
      <button onClick=${() => map.current.zoomBy(2)} aria-label="Zoom in">+</button>
      <button onClick=${() => map.current.zoomBy(0.5)} aria-label="Zoom out">−</button>
      <button onClick=${() => map.current.home(true)} aria-label="Whole world" title="Whole world"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      ${reveal ? html`<button onClick=${() => map.current.showAnswer()} aria-label="Back to the answer" title="Back to the answer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2"/></svg></button>` : ''}
    </div>
  </div>`
}

const ASK = { country: 'Find the country', capital: 'Find the capital city', city: 'Find the city' }

export default function GeoGuess({ v, inst, seated }) {
  const [pin, setPin] = useState(null)
  useEffect(() => setPin(null), [v.round])
  const reveal = v.phase === 'reveal'
  const locked = v.mine !== null
  const rows = reveal ? Object.entries(v.result).sort((a, b) => b[1].pts - a[1].pts || a[1].km - b[1].km) : []
  const mine = locked ? v.mine : pin
  const label = reveal ? (v.kind === 'country' ? v.name : `${v.name}, ${v.answer.of}`) : ''
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Place ${v.round + 1} of ${v.rounds}`} sub=${ASK[v.kind]} until=${v.until} />
      <div class="geo-ask"><span class="dim small">${ASK[v.kind]}</span><b>${v.name}</b>${v.kind !== 'country' ? html`<span class="dim small">${reveal && v.answer.of ? `in ${v.answer.of}` : ' '}</span>` : ''}</div>
      <${WorldMap}
        pin=${mine && !reveal ? { ...mine, color: colorOf(ME), label: initial(ME) } : null}
        onPin=${seated && !locked && !reveal ? setPin : null}
        reveal=${reveal ? {
          target: { lat: v.answer.lat, lon: v.answer.lon, shape: v.answer.shape, label },
          pins: Object.entries(v.pins).map(([id, p]) => ({ id, ...p, at: v.result[id]?.at ?? null, color: colorOf(id), label: initial(id), note: `${id === ME ? 'You' : nameOf(id)} · ${far(v.result[id]?.km ?? 0)}` })),
        } : null} />
      ${!reveal && seated ? html`<div class="row center-row">${locked ? html`<span class="plus">Pin locked. Waiting for the others…</span>`
        : html`<span class="dim small">${pin ? 'Tap somewhere else to move it.' : 'Zoom in and tap to drop your pin.'}</span><button class="primary" disabled=${!pin} onClick=${() => act({ a: 'pin', lat: pin.lat, lon: pin.lon })}>Lock in</button>`}</div>` : ''}
      ${reveal ? html`<table class="tbl">${rows.map(([id, r], i) => html`<tr key=${id}><td>${i + 1}</td><td><${Name} id=${id} /></td><td>${far(r.km)}</td><td class="plus">+${r.pts}</td></tr>`)}</table>
        ${!rows.length ? html`<p class="dim center">Nobody dropped a pin. The answer is marked on the map.</p>` : ''}` : html`<${Waiting} ids=${inst.players} done=${v.pinned} label="locked in" />`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? Object.fromEntries(rows.map(([id, r]) => [id, r.pts])) : null} />
      <p class="dim small">100 for a pin inside the country or on the city. Points fall with distance.</p></aside>
  </div>`
}
