// Closest Wins: a number question; the nearest guesses score.
import { html, Head, Scores, AnswerBox, Waiting, Name } from '../ui.js'
import { act } from '../core.js'

const show = n => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : String(Math.round(n * 1000) / 1000))

export default function Closest({ v, inst, seated }) {
  const answering = v.phase === 'answer'
  const unit = v.unit === 'year' ? '' : v.unit
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Question ${v.round + 1} of ${v.rounds}`} sub="Closest guess wins" until=${v.until} />
      <div class="prompt">${v.q}<div class="dim small unit">${v.unit === 'year' ? 'Answer with a year, like 1999' : `Answer in ${v.unit}`}</div></div>
      ${answering ? html`
        ${v.mine !== null ? html`<p class="center">Your guess: <b>${show(v.mine)}</b> ${unit} <span class="dim small">(you can change it)</span></p>` : ''}
        ${seated && html`<${AnswerBox} key=${v.round} onSend=${t => act({ a: 'answer', value: t })} placeholder=${v.unit === 'year' ? 'e.g. 1975' : 'Your guess'} mode="number" max=${20} label=${v.mine !== null ? 'Change' : 'Lock in'} />`}
        <p class="dim small center">Shortcuts work: 12k, 2.5 lakh, 3 crore.</p>
        <${Waiting} ids=${inst.players} done=${v.answered} />`
      : html`<div class="answer-reveal"><div class="dim small">The answer</div><div class="big-num">${show(v.answer)} <span class="small">${unit}</span></div>${v.note ? html`<p class="dim small">${v.note}</p>` : ''}</div>
        <table class="tbl">${v.result.map(r => html`<tr key=${r.id}><td>${r.place}</td><td><${Name} id=${r.id} /></td><td>${show(r.guess)}</td><td class="plus">+${r.pts}</td></tr>`)}</table>
        ${!v.result.length ? html`<p class="dim center">Nobody guessed.</p>` : ''}`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} /></aside>
  </div>`
}
