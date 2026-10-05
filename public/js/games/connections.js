// Connections: pick four words that belong together; four mistakes and you are out.
import { html, Head, Scores, Waiting, useState, useEffect } from '../ui.js'
import { act, onEvent, toast } from '../core.js'

function Found({ g }) {
  return html`<div class=${'cn-group l' + g.level}><b>${g.name}</b><span>${g.words.join(', ')}</span></div>`
}

export default function Connections({ v, inst, seated }) {
  const [sel, setSel] = useState([])
  const [order, setOrder] = useState(null)
  useEffect(() => { setSel([]); setOrder(null) }, [v.round])
  useEffect(() => onEvent(e => { if (e.k === 'oneAway') toast('One away…') }), [])
  useEffect(() => { setSel(x => x.filter(w => !v.found.some(g => g.words.includes(w)))) }, [v.found.length])
  const reveal = v.phase === 'reveal'
  const taken = new Set(v.found.flatMap(g => g.words))
  const words = (order ?? v.words).filter(w => !taken.has(w))
  const toggle = w => setSel(sel.includes(w) ? sel.filter(x => x !== w) : sel.length < 4 ? [...sel, w] : sel)
  const shuffle = () => { const a = words.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } setOrder(a) }
  const playing = !reveal && seated && !v.finished
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${v.rounds > 1 ? `Board ${v.round + 1} of ${v.rounds}` : 'Find the four groups'} sub="Four words that share something, four times" until=${v.until} />
      <div class="cn">
        ${(reveal ? v.groups : v.found).map((g, i) => html`<${Found} key=${i} g=${g} />`)}
        ${!reveal ? html`<div class="cn-grid">${words.map(w => html`<button key=${w} class=${'cn-word' + (sel.includes(w) ? ' sel' : '')} disabled=${!playing} onClick=${() => toggle(w)} aria-pressed=${sel.includes(w)}>${w}</button>`)}</div>` : ''}
      </div>
      ${playing ? html`<div class="row center-row wrapgap">
        <span class="cn-lives" aria-label=${`${v.max - v.mistakes} mistakes left`}>Mistakes left ${Array.from({ length: v.max }, (_, i) => html`<i key=${i} class=${i < v.max - v.mistakes ? 'on' : ''}></i>`)}</span>
        <button onClick=${shuffle}>Shuffle</button><button onClick=${() => setSel([])} disabled=${!sel.length}>Clear</button>
        <button class="primary" disabled=${sel.length !== 4} onClick=${() => act({ a: 'guess', words: sel })}>Submit</button></div>` : ''}
      ${!reveal && v.finished ? html`<p class="center">${v.out ? 'Out of mistakes.' : html`<b class="plus">Solved!</b>`} <span class="dim">Waiting for the others…</span></p>` : ''}
      ${reveal ? html`<p class="dim small center">Colours go from easy (yellow) to tricky (purple).</p>` : ''}
      ${!reveal ? html`<${Waiting} ids=${inst.players} done=${Object.keys(v.progress).filter(id => v.progress[id].done)} label="finished" />` : ''}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? v.gained : null} note=${reveal ? null : id => `${v.progress[id]?.found ?? 0}/4`} /></aside>
  </div>`
}
