// Reaction: wait for the signal and tap. The time is measured here, from the frame the signal was painted.
import { html, useState, useEffect, useRef, Scores, Name, Waiting } from '../ui.js'
import { act, now, ME } from '../core.js'

const HINT = { green: 'Tap when it turns green', decoy: 'Only green counts. Other colours are traps', target: 'Tap the target the moment it appears' }

export default function Reaction({ v, inst, seated }) {
  const [, force] = useState(0)
  const st = useRef({ key: '', shownAt: 0, done: false, color: null })
  const key = `${v.round}:${v.goAt}`
  if (st.current.key !== key) st.current = { key, shownAt: 0, done: false, color: null }
  const me = st.current

  // Run the round's timeline on this device: decoys, then the signal.
  useEffect(() => {
    if (v.phase !== 'wait') return
    const timers = []
    const at = (t, fn) => timers.push(setTimeout(fn, Math.max(0, t - now())))
    for (const d of v.decoys) { at(d.at, () => { me.color = d.color; force(x => x + 1) }); at(d.at + 450, () => { if (me.color === d.color) { me.color = null; force(x => x + 1) } }) }
    at(v.goAt, () => {
      me.color = 'go'
      force(x => x + 1)
      requestAnimationFrame(() => { me.shownAt = performance.now() })
    })
    const tick = setInterval(() => force(x => x + 1), 500)
    return () => { timers.forEach(clearTimeout); clearInterval(tick) }
  }, [key, v.phase])

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
  return html`<div class="play2"><div class="pmain">
    <div class="ghead"><div><div class="gtitle">Round ${v.round + 1} of ${v.rounds}</div><div class="dim small">${HINT[v.kind]}</div></div></div>
    ${!res ? html`<div class=${cls} ref=${area} onPointerDown=${tap} onKeyDown=${tap} role="button" tabindex="0" aria-live="assertive">
      ${v.kind === 'target' && me.color === 'go' ? html`<div class="target" style=${`left:${v.pos.x}%;top:${v.pos.y}%`}></div><span class="vh">TAP!</span>` : html`<span>${label}</span>`}
    </div>
    <${Waiting} ids=${inst.players} done=${v.tapped} label="tapped" />`
    : html`<div class="rx-res"><table class="tbl">${order.map(([id, ms]) => html`<tr key=${id}><td><${Name} id=${id} /></td><td>${ms < 0 ? html`<span class="bad">false start</span>` : html`<b>${ms} ms</b>`}</td><td class="plus">${v.gained[id] ? `+${v.gained[id]}` : ''}</td></tr>`)}</table>
      ${!order.length ? html`<p class="dim center">Nobody tapped.</p>` : ''}</div>`}
  </div><aside class="pside"><${Scores} pts=${v.pts} /></aside></div>`
}
