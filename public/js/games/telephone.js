// Telephone: write, draw, describe… then watch each book unfold.
import { html, Canvas, Head, Name, Avatar, AnswerBox, Waiting, Scores, nameOf } from '../ui.js'
import { act, ME } from '../core.js'

function Show({ v, inst }) {
  const owner = v.owner === ME
  return html`<div class="play2"><div class="pmain">
    <${Head} title=${`${nameOf(v.owner)}'s book`} sub=${`Book ${v.book + 1} of ${v.books}`} until=${v.until} />
    <div class="book">${v.entries.map((e, i) => html`<div key=${i} class="entry">
      <div class="entry-by"><${Avatar} id=${e.by} size=${22} /> <${Name} id=${e.by} /> <span class="dim small">${i === 0 ? 'wrote' : e.kind === 'draw' ? 'drew' : 'saw'}</span></div>
      ${e.kind === 'text' ? html`<div class="entry-text">${e.text}</div>` : html`<${Canvas} strokes=${e.strokes} small=${true} />`}
      <button class=${'like' + (e.likes.includes(ME) ? ' on' : '')} disabled=${e.by === ME} onClick=${() => act({ a: 'like', e: i })} aria-label=${`Like${e.likes.length ? `, ${e.likes.length} so far` : ''}`}><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4V10zM7 10l4-7c1.5 0 2.5 1.2 2.2 2.7L12.6 9H19a2 2 0 0 1 2 2.3l-1.3 7.6A2.5 2.5 0 0 1 17.2 21H7" /></svg>${e.likes.length || ''}</button>
    </div>`)}</div>
    <div class="center">${owner || !inst.players.includes(v.owner) ? html`<button class="primary big" onClick=${() => act({ a: 'next' })}>${v.entries.length < v.total ? 'Show next' : v.book + 1 < v.books ? 'Next book' : 'Finish'}</button>` : html`<p class="dim small">${nameOf(v.owner)} is showing their book. It moves on by itself too.</p>`}</div>
  </div><aside class="pside"><div class="dim small">Likes</div><${Scores} pts=${v.pts} /></aside></div>`
}

export default function Telephone({ v, inst }) {
  if (v.phase === 'show') return html`<${Show} v=${v} inst=${inst} />`
  const doneIds = Object.keys(v.done).filter(k => v.done[k])
  const title = v.step === 0 ? 'Write a phrase' : v.kind === 'draw' ? 'Draw this' : 'What is this drawing?'
  return html`<div class="tele">
    <${Head} title=${title} sub=${`Step ${v.step + 1} of ${v.steps}`} until=${v.until} />
    ${!v.seated ? html`<p class="dim center">You are watching this one.</p>` : html`
      ${v.prompt ? (v.prompt.kind === 'text' ? html`<div class="prompt">“${v.prompt.text}”</div>` : html`<${Canvas} strokes=${v.prompt.strokes} small=${true} />`) : ''}
      ${v.kind === 'text' ? html`
        ${v.mine ? html`<p class="center">Sent: <b>${v.mine}</b> <span class="dim small">(send again to change it)</span></p>` : ''}
        <${AnswerBox} key=${v.step} onSend=${t => act({ a: 'text', text: t })} placeholder=${v.step === 0 ? 'A monkey riding a rocket…' : 'I think it shows…'} max=${100} label=${v.mine ? 'Change' : 'Send'} />`
      : html`<${Canvas} k=${v.step} strokes=${v.mine} edit=${!v.doneMe} send=${act} />
        <button class=${'wide big' + (v.doneMe ? '' : ' primary')} onClick=${() => act({ a: 'done' })}>${v.doneMe ? 'Keep drawing' : 'Done'}</button>`}
    `}
    <${Waiting} ids=${inst.players} done=${doneIds} label="done" />
  </div>`
}
