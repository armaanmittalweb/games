// Reaction: wait for the signal and tap. The time is measured here, from the frame the signal was painted.
import { html, useState, useEffect, useRef, Scores, Waiting, RoundResult, nameOf } from '../ui.js'
import { act, now, ME } from '../core.js'

const HINT = { green: 'Tap when it turns green', decoy: 'Only green counts. Other colours are traps', target: 'Tap the target the moment it appears' }

export default function Reaction({ v, inst, seated }) {
  const [, force] = useState(0)
  const st = useRef({ key: '', shownAt: 0, done: false, color: null })
  const key = `${v.round}:${v.goAt}`
  if (st.current.key !== key) st.current = { key, shownAt: 0, done: false, color: null }
  const me = st.current
  // A pause holds the round: the signal is taken away again, and the timeline runs on from where it was once play
  // carries on (a tap after that is timed from when the signal shows again).
  const paused = !!inst.paused
  if (paused && !me.done) { me.color = null; me.shownAt = 0 }

  // Run the round's timeline on this device: decoys still to come, then the signal.
  useEffect(() => {
    if (v.phase !== 'wait' || paused) return
    const timers = []
    const at = (t, fn) => timers.push(setTimeout(fn, Math.max(0, t - now())))
    for (const d of v.decoys.filter(d => d.at > now())) { at(d.at, () => { me.color = d.color; force(x => x + 1) }); at(d.at + 450, () => { if (me.color === d.color) { me.color = null; force(x => x + 1) } }) }
    at(v.goAt, () => {
      me.color = 'go'
      force(x => x + 1)
      requestAnimationFrame(() => { me.shownAt = performance.now() })
    })
    const tick = setInterval(() => force(x => x + 1), 500)
    return () => { timers.forEach(clearTimeout); clearInterval(tick) }
  }, [key, v.phase, paused])

  const tapped = v.tapped.includes(ME) || me.done
  // Space or Enter counts as a tap (a keyboard has no target to aim at, so a key press hits it).
  const area = useRef()
  useEffect(() => { if (v.phase === 'wait') area.current?.focus({ preventScroll: true }) }, [key])
  const tap = e => {
    const byKey = e.type === 'keydown'
    if (byKey && e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (!seated || v.phase !== 'wait' || tapped) return
    if (!byKey && v.kind === 'target' && me.color === 'go' && !e.target.closest('.target')) return
    me.done = true
    if (me.color === 'go' && me.shownAt) act({ a: 'tap', ms: Math.round(performance.now() - me.shownAt) })
    else { me.early = true; act({ a: 'false' }) }
    force(x => x + 1)
  }

  let cls = 'rx', label = 'Wait for it…'
  if (me.color === 'go') { cls += v.kind === 'target' ? ' rx-target' : ' rx-go'; label = 'TAP!' }
  else if (me.color) { cls += ' rx-decoy'; label = 'Not this one!' }
  else cls += ' rx-wait'
  if (tapped) label = me.early ? 'False start!' : 'Done. Waiting for the others'
  const res = v.phase === 'result'
  const order = Object.entries(v.taps).sort((a, b) => (a[1] < 0) - (b[1] < 0) || a[1] - b[1])
  const best = order.find(([, ms]) => ms >= 0)
  const rows = order.map(([id, ms], i) => ms < 0
    ? { id, value: 'false start', bar: 0, pts: v.gained[id] ?? 0, bad: true, place: '–' }
    : { id, value: `${ms} ms`, bar: best[1] / Math.max(ms, 1), note: i ? `+${ms - best[1]} ms` : 'quickest', pts: v.gained[id] ?? 0 })
  return html`<div class="play2"><div class="pmain">
    <div class="ghead"><div><div class="gtitle">Round ${v.round + 1} of ${v.rounds}</div><div class="dim small">${HINT[v.kind]}</div></div></div>
    ${!res ? html`<div class=${cls} ref=${area} onPointerDown=${tap} onKeyDown=${tap} role="button" tabindex="0" aria-live="assertive">
      ${v.kind === 'target' && me.color === 'go' ? html`<div class="target" style=${`left:${v.pos.x}%;top:${v.pos.y}%`}></div><span class="vh">TAP!</span>` : html`<span>${label}</span>`}
    </div>
    <${Waiting} ids=${inst.players} done=${v.tapped} label="tapped" />`
    : html`<${RoundResult} head=${best ? `${best[0] === ME ? 'You were' : `${nameOf(best[0])} was`} quickest` : order.length ? 'Everyone jumped the gun' : ''} sub=${best ? `${best[1]} ms` : ''} rows=${rows} empty="Nobody tapped." />`}
  </div><aside class="pside"><${Scores} pts=${v.pts} gained=${res ? v.gained : null} /></aside></div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => {
  if (v.phase !== 'result') return null
  const best = Object.entries(v.taps).filter(([, ms]) => ms >= 0).sort((a, b) => a[1] - b[1])[0]
  return { text: best ? `Quickest: ${best[0] === ME ? 'you' : nameOf(best[0])}, ${best[1]} ms` : 'Nobody was quick enough', pts: v.gained?.[ME] ?? 0, good: best?.[0] === ME }
}
