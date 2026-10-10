// Closest Wins: a number question; the nearest guesses score.
import { html, Head, Scores, AnswerBox, Waiting, RoundResult, nameOf, initialOf, colorOf } from '../ui.js'
import { ME } from '../core.js'
import { act } from '../core.js'

// Lakh-style grouping for big amounts; a year is written as a year (1969, not 1,969).
const offBy = (guess, v) => { const d = Math.abs(guess - v.answer); return d === 0 ? 'spot on' : `off by ${show(d, v.unit === 'year' ? '' : v.unit)} ${v.unit === 'year' ? (d === 1 ? 'year' : 'years') : v.unit}` }
const show = (n, unit) => (unit === 'year' ? String(Math.round(n)) : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : String(Math.round(n * 1000) / 1000))

/**
 * Every guess on one line with the answer, so the room sees at a glance who was near. A spread of many times over (a
 * population guessed in thousands and in crores) is drawn on a log scale.
 */
function NumberLine({ answer, guesses }) {
  const all = [answer, ...guesses.map(g => g.value)]
  const log = all.every(x => x > 0) && Math.max(...all) / Math.min(...all) > 50
  const f = x => (log ? Math.log10(x) : x)
  let lo = Math.min(...all.map(f)), hi = Math.max(...all.map(f))
  if (hi === lo) { lo -= 1; hi += 1 }
  const at = x => 4 + ((f(x) - lo) / (hi - lo)) * 92
  // Guesses close together sit in rows above the line instead of on top of each other.
  const placed = guesses.map(g => ({ ...g, x: at(g.value) })).sort((a, b) => a.x - b.x)
  const ends = []
  for (const g of placed) { let row = ends.findIndex(e => g.x - e > 7); if (row < 0) { row = ends.length; ends.push(0) } ends[row] = g.x; g.row = row }
  return html`<div class="nline" style=${`--rows:${Math.max(1, ends.length)}`} aria-hidden="true">
    <div class="nl-track"></div>
    ${placed.map(g => html`<span key=${g.id} class=${'nl-dot' + (g.id === ME ? ' me' : '')} style=${`left:${g.x}%;--row:${g.row};--c:${colorOf(g.id)}`} title=${nameOf(g.id)}>${initialOf(g.id)}</span>`)}
    <span class="nl-answer" style=${`left:${at(answer)}%`}><i></i></span>
  </div>`
}

export default function Closest({ v, inst, seated }) {
  const answering = v.phase === 'answer'
  const unit = v.unit === 'year' ? '' : v.unit
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Question ${v.round + 1} of ${v.rounds}`} sub="Closest guess wins" until=${v.until} />
      <div class="prompt">${v.q}<div class="dim small unit">${v.unit === 'year' ? 'Answer with a year, like 1999' : `Answer in ${v.unit}`}</div></div>
      ${answering ? html`
        ${v.mine !== null ? html`<p class="center">Your guess: <b>${show(v.mine, v.unit)}</b> ${unit} <span class="dim small">(you can change it)</span></p>` : ''}
        ${seated && html`<${AnswerBox} key=${v.round} onSend=${t => act({ a: 'answer', value: t })} placeholder=${v.unit === 'year' ? 'e.g. 1975' : 'Your guess'} mode="number" max=${20} label=${v.mine !== null ? 'Change' : 'Lock in'} />`}
        <p class="dim small center">Shortcuts work: 12k, 2.5 lakh, 3 crore.</p>
        <${Waiting} ids=${inst.players} done=${v.answered} />`
      : html`<div class="answer-reveal"><div class="dim small">The answer</div><div class="big-num">${show(v.answer, v.unit)} <span class="small">${unit}</span></div>${v.note ? html`<p class="dim small">${v.note}</p>` : ''}</div>
        <${RoundResult} head=${v.result.length ? `${v.result[0].id === ME ? 'You were' : `${nameOf(v.result[0].id)} was`} closest` : ''} sub=${v.result.length ? offBy(v.result[0].guess, v) : ''} empty="Nobody guessed."
          rows=${v.result.map(r => {
            const worst = Math.max(...v.result.map(x => Math.abs(x.guess - v.answer)), 1)
            return { id: r.id, place: r.place, value: `${show(r.guess, v.unit)} ${unit}`, bar: Math.max(0.04, 1 - Math.abs(r.guess - v.answer) / worst * 0.9), note: r.guess === v.answer ? 'spot on!' : offBy(r.guess, v), pts: r.pts }
          })}>
          ${v.result.length ? html`<${NumberLine} answer=${v.answer} guesses=${v.result.map(r => ({ id: r.id, value: r.guess }))} />` : ''}
        </${RoundResult}>`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${answering ? null : Object.fromEntries(v.result.map(r => [r.id, r.pts]))} /></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => {
  const me = v.result?.find(r => r.id === ME)
  return v.answer === undefined || v.answer === null ? null : { text: `Answer: ${show(v.answer, v.unit)}${v.unit === 'year' ? '' : ` ${v.unit}`}${me ? ` · you were ${offBy(me.guess, v)}` : ''}`, pts: me?.pts ?? 0, good: me?.place === 1 }
}
