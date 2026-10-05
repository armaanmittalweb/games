// Mastermind: build a guess from the colours, see how close it is, crack the code in as few guesses as you can.
import { html, Head, Scores, Name, Waiting, useState, useEffect } from '../ui.js'
import { act } from '../core.js'

// Colours that stay apart for most kinds of colour blindness, each with a letter as well.
export const PEGS = [['#e03131', 'R', 'red'], ['#1c7ed6', 'B', 'blue'], ['#2f9e44', 'G', 'green'], ['#fcc419', 'Y', 'yellow'],
  ['#9c36b5', 'P', 'purple'], ['#f76707', 'O', 'orange'], ['#e64980', 'K', 'pink'], ['#15aabf', 'T', 'teal']]

const Peg = ({ c, small, onClick, label }) => c === null || c === undefined
  ? html`<button type="button" class=${'mm-peg empty' + (small ? ' sm' : '')} onClick=${onClick} disabled=${!onClick} aria-label=${label ?? 'empty'}></button>`
  : html`<button type="button" class=${'mm-peg' + (small ? ' sm' : '')} style=${`background:${PEGS[c][0]}`} onClick=${onClick} disabled=${!onClick} aria-label=${label ?? PEGS[c][2]}>${PEGS[c][1]}</button>`

function Marks({ exact, near, pegs }) {
  const dots = [...Array(exact).fill('x'), ...Array(near).fill('n'), ...Array(pegs - exact - near).fill('')]
  return html`<span class="mm-marks" style=${`--cols:${pegs > 4 ? 3 : 2}`} title=${`${exact} right place, ${near} wrong place`} aria-label=${`${exact} right colour in the right place, ${near} right colour in the wrong place`}>
    ${dots.map((d, i) => html`<i key=${i} class=${d}></i>`)}</span>`
}

function Row({ g, pegs }) {
  return html`<div class="mm-row">${g.pegs.map((c, i) => html`<${Peg} key=${i} c=${c} small />`)}<${Marks} exact=${g.exact} near=${g.near} pegs=${pegs} />
    <span class="dim small mm-says">${g.exact} ✓ · ${g.near} ↔</span></div>`
}

function Builder({ v }) {
  const [cur, setCur] = useState(() => Array(v.pegs).fill(null))
  useEffect(() => setCur(Array(v.pegs).fill(null)), [v.round, v.mine.length])
  const add = c => {
    const i = cur.indexOf(null)
    if (i < 0) return
    if (!v.repeats && cur.includes(c)) return
    const n = cur.slice(); n[i] = c; setCur(n)
  }
  const full = !cur.includes(null)
  useEffect(() => {
    const onKey = e => {
      const k = PEGS.findIndex(p => p[1] === e.key.toUpperCase())
      if (k >= 0 && k < v.colors) add(k)
      else if (e.key === 'Backspace') { const i = cur.findLastIndex(x => x !== null); if (i >= 0) { const n = cur.slice(); n[i] = null; setCur(n) } }
      else if (e.key === 'Enter' && full) act({ a: 'guess', pegs: cur })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  return html`<div class="mm-build">
    <div class="mm-row cur">${cur.map((c, i) => html`<${Peg} key=${i} c=${c} onClick=${c === null ? null : () => { const n = cur.slice(); n[i] = null; setCur(n) }} label=${c === null ? `slot ${i + 1}, empty` : `slot ${i + 1}, ${PEGS[c][2]}: tap to clear`} />`)}
      <button class="primary" disabled=${!full} onClick=${() => act({ a: 'guess', pegs: cur })}>Guess</button></div>
    <div class="mm-palette">${PEGS.slice(0, v.colors).map((p, i) => html`<${Peg} key=${i} c=${i} onClick=${() => add(i)} label=${`add ${p[2]}`} />`)}</div>
    <p class="dim small center">${v.repeats ? 'A colour can appear more than once.' : 'Each colour appears at most once.'} ${v.max - v.mine.length} guesses left.</p>
  </div>`
}

export default function Mastermind({ v, inst, seated }) {
  const reveal = v.phase === 'reveal'
  const cracked = v.mine.some(g => g.exact === v.pegs)
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Code ${v.round + 1} of ${v.rounds}`} sub=${`${v.pegs} pegs · ${v.colors} colours`} until=${v.until} />
      <div class="mm-board">
        ${v.mine.map((g, i) => html`<${Row} key=${i} g=${g} pegs=${v.pegs} />`)}
        ${!reveal && seated && !v.finished ? html`<${Builder} v=${v} />` : ''}
        ${!reveal && v.finished ? html`<p class="center">${cracked ? html`<b class="plus">Cracked in ${v.mine.length}!</b>` : 'Out of guesses.'} <span class="dim">Waiting for the others…</span></p>` : ''}
      </div>
      <p class="dim small center">✓ right colour, right place · ↔ right colour, wrong place</p>
      ${reveal ? html`<div class="answer-reveal"><div class="dim small">The code</div><div class="mm-row">${v.code.map((c, i) => html`<${Peg} key=${i} c=${c} />`)}</div></div>
        <table class="tbl">${inst.players.slice().sort((a, b) => (v.gained[b] ?? 0) - (v.gained[a] ?? 0)).map(id => {
          const gs = v.all[id] ?? [], ok = gs.some(g => g.exact === v.pegs)
          return html`<tr key=${id}><td><${Name} id=${id} /></td><td>${ok ? `cracked in ${gs.length}` : gs.length ? `${gs.length} guesses, not cracked` : 'no guesses'}</td><td class="plus">${v.gained[id] ? `+${v.gained[id]}` : ''}</td></tr>`
        })}</table>` : ''}
      ${!reveal ? html`<${Waiting} ids=${inst.players} done=${v.done} label="finished" />` : ''}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? v.gained : null} note=${reveal ? null : id => `${v.progress[id]?.n ?? 0}${v.progress[id]?.cracked ? ' ✓' : ''}`} /></aside>
  </div>`
}
