// Mind Meld: one prompt, everyone answers, matches score.
import { html, Head, Scores, AnswerBox, Waiting, Name, RevealHead } from '../ui.js'
import { act, ME } from '../core.js'

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
      : html`${v.groups.length ? html`<${RevealHead} head=${v.groups[0].ids.length > 1 ? `${v.groups[0].ids.length} of you said “${v.groups[0].text}”` : 'Nobody matched'}
          sub=${!seated ? '' : (v.groups.find(g => g.ids.includes(ME))?.ids.length ?? 0) > 1 ? html`<span class="ok">+${v.groups.find(g => g.ids.includes(ME)).ids.length - 1} for you</span>` : 'No match for you this time'} />` : ''}
        <div class="groups">${v.groups.map(g => html`<div key=${g.text} class=${'group' + (g.ids.length > 1 ? ' match' : '')}>
          <div class="row between"><b class="gtext">${g.text}</b>${g.ids.length > 1 ? html`<span class="plus">+${g.ids.length - 1} each</span>` : html`<span class="dim small">no match</span>`}</div>
          <div class="ids">${g.ids.map(id => html`<${Name} key=${id} id=${id} />`)}</div></div>`)}
          ${!v.groups.length ? html`<p class="dim center">Nobody answered.</p>` : ''}</div>`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${answering ? null : Object.fromEntries(v.groups.flatMap(g => g.ids.map(id => [id, g.ids.length - 1])))} /></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => {
  const top = v.groups?.[0], mine = v.groups?.find(g => g.ids.includes(ME))
  return top ? { text: top.ids.length > 1 ? `Most said “${top.text}”` : 'Nobody matched', pts: mine ? mine.ids.length - 1 : 0, good: !!mine && mine.ids.length > 1 } : null
}
