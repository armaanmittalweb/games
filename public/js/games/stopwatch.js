// Stop the Clock: tap Start, count in your head, tap Stop. No running clock is ever shown; your real time appears
// only once you have stopped. The run is timed on this device between the two taps, so network lag does not matter.
import { html, useState, useEffect, useRef, Scores, Name, Waiting, useTick, Mark } from '../ui.js'
import { act, now, ME } from '../core.js'

const sec = ms => (ms / 1000).toFixed(2)
const signed = ms => `${ms >= 0 ? '+' : '−'}${(Math.abs(ms) / 1000).toFixed(3)} s`

export default function Stopwatch({ v, inst, seated }) {
  useTick(250)
  const [, force] = useState(0)
  const run = useRef({ key: '', t0: 0, ms: null })
  const key = `${v.round}:${v.openAt}`
  if (run.current.key !== key) run.current = { key, t0: 0, ms: null }
  const r = run.current

  const ready = now() >= v.openAt
  const stopped = r.ms !== null || v.stopped.includes(ME)
  const running = r.t0 > 0 && !stopped
  const live = seated && v.phase === 'run' && ready && !stopped
  const press = () => {
    if (!live) return
    if (!r.t0) { r.t0 = performance.now(); force(x => x + 1); return }
    const ms = performance.now() - r.t0
    if (ms < 200) return // a double tap, not a run
    r.ms = ms
    act({ a: 'stop', ms: Math.round(ms) })
    force(x => x + 1)
  }
  const pressRef = useRef(press)
  pressRef.current = press
  useEffect(() => {
    const on = e => {
      if (e.code !== 'Space' && e.key !== 'Enter') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      e.preventDefault()
      if (!e.repeat) pressRef.current()
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  const result = v.phase === 'result'
  const rows = Object.entries(v.stops).map(([id, ms]) => ({ id, ms, d: ms - v.target })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
  let face
  if (!ready) face = html`<span class="sw-count">${Math.max(1, Math.ceil((v.openAt - now()) / 1000))}</span>`
  else if (running) face = html`<span class="sw-hidden">${Mark.stopwatch()}<span class="sw-dots"><i></i><i></i><i></i></span></span>`
  else if (r.ms !== null) face = html`<span>${sec(r.ms)}</span>`
  else if (stopped) face = html`<span class="dim">done</span>`
  else face = html`<span class="dim">0.00</span>`
  return html`<div class="play2"><div class="pmain">
    <div class="ghead"><div><div class="gtitle">Round ${v.round + 1} of ${v.rounds}</div><div class="dim small">No clock while it runs. Count in your head.</div></div></div>
    <div class="sw-target"><span class="dim small">Stop at exactly</span><b>${sec(v.target)} s</b></div>
    ${!result ? html`
      <div class=${'sw-face' + (r.ms !== null ? ' shown' : '')}>${face}</div>
      ${r.ms !== null ? html`<p class="center sw-off">${Math.abs(r.ms - v.target) <= v.perfect ? html`<b class="ok">PERFECT!</b>` : html`<b>${signed(r.ms - v.target)}</b> from the target`}</p>` : ''}
      ${seated && !stopped ? html`<button class=${'sw-btn' + (running ? ' stop' : '')} disabled=${!live} onPointerDown=${e => { e.preventDefault(); press() }}>
        ${!ready ? 'Get ready…' : running ? 'STOP' : 'START'}</button>
        <p class="dim small center">${running ? 'Tap Stop when you think the time has come.' : 'Tap Start whenever you are ready. Space bar works too.'}</p>` : ''}
      <${Waiting} ids=${inst.players} done=${v.stopped} label="stopped" />`
    : html`<table class="tbl sw-res">
        <tr><th>Player</th><th>Stopped at</th><th>Off by</th><th></th></tr>
        ${rows.map(x => html`<tr key=${x.id} class=${x.id === ME ? 'me' : ''}><td><${Name} id=${x.id} /></td><td><b>${sec(x.ms)} s</b></td>
          <td class=${Math.abs(x.d) <= v.perfect ? 'ok' : ''}>${Math.abs(x.d) <= v.perfect ? 'PERFECT' : signed(x.d)}</td><td class="plus">+${v.gained[x.id] ?? 0}</td></tr>`)}
      </table>${!rows.length ? html`<p class="dim center">Nobody stopped the clock.</p>` : ''}`}
  </div><aside class="pside"><${Scores} pts=${v.pts} gained=${result ? v.gained : null} /></aside></div>`
}
