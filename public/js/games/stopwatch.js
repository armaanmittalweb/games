// Stop the Clock: tap Start, count in your head, tap Stop. No running clock is ever shown; your real time appears
// only once you have stopped. The run is timed on this device between the two taps, so network lag does not matter.
import { html, useState, useEffect, useRef, Scores, Waiting, useTick, Mark, RoundResult, nameOf } from '../ui.js'
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
  // A run that was going when the host paused would count the pause too: it starts again.
  if (inst.paused && r.t0 && r.ms === null) r.t0 = 0

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
    : html`<${RoundResult} head=${rows.length ? `${rows[0].id === ME ? 'You were' : `${nameOf(rows[0].id)} was`} closest` : ''} sub=${rows.length ? (Math.abs(rows[0].d) <= v.perfect ? 'a perfect stop' : `off by ${(Math.abs(rows[0].d) / 1000).toFixed(2)} s`) : ''}
        rows=${rows.map(x => {
          const perfect = Math.abs(x.d) <= v.perfect, worst = Math.max(...rows.map(r => Math.abs(r.d)), 1)
          return { id: x.id, value: `${sec(x.ms)} s`, bar: perfect ? 1 : Math.max(0.04, 1 - Math.abs(x.d) / worst * 0.9), note: perfect ? 'PERFECT' : `${signed(x.d)} ${x.d < 0 ? 'early' : 'late'}`, pts: v.gained[x.id] ?? 0 }
        })} empty="Nobody stopped the clock." />`}
  </div><aside class="pside"><${Scores} pts=${v.pts} gained=${result ? v.gained : null} /></aside></div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => {
  if (v.phase !== 'result') return null
  const best = Object.entries(v.stops).sort((a, b) => Math.abs(a[1] - v.target) - Math.abs(b[1] - v.target))[0]
  return { text: best ? `Closest: ${best[0] === ME ? 'you' : nameOf(best[0])}, ${(Math.abs(best[1] - v.target) / 1000).toFixed(2)} s off` : 'Nobody stopped the clock', pts: v.gained?.[ME] ?? 0, good: best?.[0] === ME }
}
