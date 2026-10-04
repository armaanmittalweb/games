// Mind Meld: one prompt, everyone answers, matches score.
import { html, Head, Scores, AnswerBox, Waiting, Name } from '../ui.js'
import { act } from '../core.js'

export default function MindMeld({ v, inst, seated }) {
  const answering = v.phase === 'answer'
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Round ${v.round + 1} of ${v.rounds}`} sub="Give the same answer as everyone else" until=${v.until} />
      <div class="prompt">${v.prompt}</div>
      ${answering ? html`
        ${v.mine ? html`<p class="center">Your answer: <b>${v.mine}</b> <span class="dim small">(you can change it until everyone is in)</span></p>` : ''}
        ${seated && html`<${AnswerBox} key=${v.round} onSend=${t => act({ a: 'answer', text: t })} placeholder="Your answer" max=${40} label=${v.mine ? 'Change' : 'Send'} />`}
        <${Waiting} ids=${inst.players} done=${v.answered} />`
      : html`<div class="groups">${v.groups.map(g => html`<div key=${g.text} class=${'group' + (g.ids.length > 1 ? ' match' : '')}>
          <div class="row between"><b class="gtext">${g.text}</b>${g.ids.length > 1 ? html`<span class="plus">+${g.ids.length - 1} each</span>` : html`<span class="dim small">no match</span>`}</div>
          <div class="ids">${g.ids.map(id => html`<${Name} key=${id} id=${id} />`)}</div></div>`)}
          ${!v.groups.length ? html`<p class="dim center">Nobody answered.</p>` : ''}</div>`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} /></aside>
  </div>`
}
