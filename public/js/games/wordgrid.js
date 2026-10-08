// Word Grid: drag across neighbouring letters (or type) to make words.
import { html, useState, useEffect, useRef, Name, Clock, useTick, plural } from '../ui.js'
import { act, now, onEvent, ME } from '../core.js'

const points = w => (w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11)
const near = (a, b, n) => a !== b && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1

function Grid({ grid, size, path = [], live = false, onPath, onDone }) {
  const ref = useRef()
  const drag = useRef(false)
  const at = e => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-i]')
    return el && ref.current.contains(el) ? Number(el.dataset.i) : null
  }
  const down = e => {
    if (!live) return
    const i = at(e)
    if (i === null) return
    e.preventDefault()
    ref.current.setPointerCapture?.(e.pointerId)
    drag.current = true
    onPath([i])
  }
  const move = e => {
    if (!drag.current) return
    const i = at(e)
    if (i === null) return
    const last = path[path.length - 1]
    if (path.length > 1 && i === path[path.length - 2]) onPath(path.slice(0, -1))
    else if (!path.includes(i) && near(i, last, size)) onPath([...path, i])
  }
  const up = () => { if (drag.current) { drag.current = false; onDone() } }
  return html`<div ref=${ref} class=${'wgrid s' + size} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
    ${grid.map((f, i) => html`<div key=${i} data-i=${i} class=${'wtile' + (path.includes(i) ? ' on' : '') + (path[path.length - 1] === i ? ' last' : '')}>${f === 'qu' ? 'Qu' : f.toUpperCase()}</div>`)}
  </div>`
}

export default function WordGrid({ v, inst, seated }) {
  useTick(250)
  const [path, setPath] = useState([])
  const [typed, setTyped] = useState('')
  const [flash, setFlash] = useState(null)
  const t = now()
  const live = seated && v.grid && t >= v.startsAt && t < v.endsAt
  const word = path.map(i => v.grid?.[i] ?? '').join('')
  useEffect(() => onEvent(ev => { if (ev.k === 'error') { setFlash({ ok: false, msg: ev.msg }); return true } }), [])
  const before = useRef(v.mine.length)
  useEffect(() => { if (v.mine.length > before.current) setFlash({ ok: true, msg: `${v.mine[v.mine.length - 1].toUpperCase()} +${points(v.mine[v.mine.length - 1])}` }); before.current = v.mine.length }, [v.mine.length])
  useEffect(() => { if (!flash) return; const x = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(x) }, [flash])

  const submit = w => { if (w.length >= v.min) act({ a: 'word', w }) }
  const total = v.mine.reduce((a, w) => a + points(w), 0)
  return html`<div class="play2"><div class="pmain wg">
    <div class="ghead"><div><div class="gtitle">Word Grid</div><div class="dim small">Drag across touching letters. ${v.min}+ letters.</div></div><${Clock} until=${t < v.startsAt ? 0 : v.endsAt} /></div>
    ${!v.grid ? html`<div class="huge center">${Math.max(1, Math.ceil((v.startsAt - t) / 1000))}</div>` : html`
      <div class="wg-word">${word ? word.toUpperCase() : flash ? html`<span class=${flash.ok ? 'ok' : 'bad msg'} role="status">${flash.msg}</span>` : html`<span class="dim">…</span>`}</div>
      <${Grid} grid=${v.grid} size=${v.size} path=${path} live=${live} onPath=${setPath} onDone=${() => { submit(word); setPath([]) }} />
      ${live ? html`<form class="answer" onSubmit=${e => { e.preventDefault(); submit(typed.trim().toLowerCase()); setTyped('') }}>
        <input value=${typed} onInput=${e => setTyped(e.target.value)} placeholder="or type a word" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type a word" /><button class="primary">Add</button></form>` : ''}
    `}
  </div>
  <aside class="pside">
    <div class="row between"><b>Your words</b><b>${total} pts</b></div>
    <div class="words">${v.mine.slice().reverse().map(w => html`<span key=${w} class="wchip">${w}<i>${points(w)}</i></span>`)}${!v.mine.length ? html`<span class="dim small">None yet</span>` : ''}</div>
    <div class="dim small" style="margin-top:12px">Words found so far</div>
    <ul class="plain">${inst.players.map(id => html`<li key=${id} class="row between"><${Name} id=${id} /><span>${v.counts[id] ?? 0}</span></li>`)}</ul>
  </aside></div>`
}

export function Summary({ inst, summary }) {
  if (!summary) return null
  const unique = summary.scoring === 'unique'
  return html`<div class="card stack">
    <div class="row between"><h2 class="nomargin">The grid</h2><span class="dim small">${plural(summary.total, 'word')} were possible</span></div>
    <div class="row wrapgap" style="align-items:flex-start">
      <${Grid} grid=${summary.grid} size=${summary.size} />
      <div class="grow">
        ${inst.players.map(id => html`<div key=${id} class="wg-res"><${Name} id=${id} />
          <div class="words">${(summary.words[id] ?? []).map(x => html`<span key=${x.w} class=${'wchip' + (unique && x.shared ? ' shared' : '')} title=${x.shared ? 'Someone else found it too' : ''}>${x.w}<i>${unique && x.shared ? 0 : x.pts}</i></span>`)}</div></div>`)}
        ${unique ? html`<p class="dim small">Crossed out: found by more than one player, so 0 points.</p>` : ''}
        ${summary.missed.length ? html`<p class="small"><b>Nobody found:</b> ${summary.missed.join(', ')}</p>` : ''}
      </div>
    </div></div>`
}
