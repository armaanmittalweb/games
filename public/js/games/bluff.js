// Dictionary Bluff: write a fake meaning, then find the real one.
import { html, Head, Scores, AnswerBox, Waiting, Name } from '../ui.js'
import { act, ME } from '../core.js'

export default function Bluff({ v, inst, seated }) {
  const word = html`<div class="prompt word-big">${v.word}</div>`
  if (v.phase === 'write') {
    return html`<div class="play2"><div class="pmain">
      <${Head} title=${`Word ${v.round + 1} of ${v.rounds}`} sub="Write a meaning that sounds real" until=${v.until} />
      ${word}
      ${v.mine ? html`<p class="center">Yours: <i>“${v.mine}”</i> <span class="dim small">(send again to change it)</span></p>` : html`<p class="center dim">What could it mean? Keep it short and believable.</p>`}
      ${seated && html`<${AnswerBox} key=${v.round} onSend=${t => act({ a: 'write', text: t })} placeholder="It means…" max=${140} label=${v.mine ? 'Change' : 'Send'} />`}
      <${Waiting} ids=${inst.players} done=${v.wrote} label="written" />
    </div><aside class="pside"><${Scores} pts=${v.pts} /></aside></div>`
  }
  const voting = v.phase === 'vote'
  return html`<div class="play2"><div class="pmain">
    <${Head} title=${`Word ${v.round + 1} of ${v.rounds}`} sub=${voting ? 'Which one is the real meaning?' : 'The real meaning'} until=${v.until} />
    ${word}
    <div class="defs">${v.options.map((o, i) => {
      let cls = 'def'
      if (o.mine) cls += ' mine'
      if (v.myVote === i) cls += ' sel'
      if (!voting && o.real) cls += ' right'
      return html`<button key=${i} class=${cls} disabled=${!voting || !seated || o.mine} onClick=${() => act({ a: 'vote', i })}>
        <span class="grow">${o.text}</span>
        ${o.mine && voting ? html`<span class="dim small">yours</span>` : ''}
        ${!voting ? html`<span class="def-meta">${o.real ? html`<b class="ok">REAL</b>` : html`<span class="small">by <${Name} id=${o.by} /></span>`}
          ${o.voters?.length ? html`<span class="small dim">· picked by ${o.voters.map((id, j) => html`${j ? ', ' : ''}<${Name} key=${id} id=${id} you=${false} />`)}</span>` : ''}</span>` : ''}
      </button>`
    })}</div>
    ${voting ? html`<${Waiting} ids=${inst.players} done=${v.voted} label="voted" />` : html`<p class="center">${v.gained[ME] ? html`<span class="plus">+${v.gained[ME]} for you</span>` : ''} <span class="dim small">3 for finding the real one, 2 for each player you fooled</span></p>`}
  </div><aside class="pside"><${Scores} pts=${v.pts} gained=${voting ? null : v.gained} /></aside></div>`
}
