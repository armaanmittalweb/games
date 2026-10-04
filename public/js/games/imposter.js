// Imposter: secret word, one clue each, discussion, vote.
import { html, useState, Head, Scores, AnswerBox, Waiting, Name, Avatar, nameOf, plural } from '../ui.js'
import { act, ME } from '../core.js'

function Secret({ v }) {
  const [hidden, setHidden] = useState(false)
  if (!v.inRound) return html`<div class="secret dim">You join from the next round.</div>`
  return html`<button class=${'secret' + (v.isImposter ? ' imp' : '')} onClick=${() => setHidden(!hidden)} title="Tap to hide or show">
    ${hidden ? html`<span class="dim">Tap to show your word</span>`
      : v.isImposter ? html`<span class="small">You are the</span><b>IMPOSTER</b><span class="small">Category: ${v.category}. Blend in, and try to work out the word.</span>`
      : html`<span class="small">${v.category} · your word</span><b>${v.word}</b><span class="small dim">${v.mode === 'undercover' ? 'One player has a different word, and they may not know it is them.' : 'One player does not know this word.'}</span>`}
  </button>`
}

function Clues({ v }) {
  return html`<div class="clues">${v.order.map(id => {
    const mine = v.clues.filter(c => c.id === id)
    return html`<div key=${id} class=${'clue-row' + (v.phase === 'clue' && v.turn === id ? ' turn' : '')}><${Avatar} id=${id} size=${26} /><span class="cname ell"><${Name} id=${id} /></span>
      <span class="grow cl">${mine.map(c => html`<span class="clue">${c.text}</span>`)}${v.phase === 'clue' && v.turn === id ? html`<span class="dim small">thinking…</span>` : ''}</span></div>`
  })}</div>`
}

export default function Imposter({ v, inst }) {
  const sub = { clue: `Clue round ${v.clueNo} of ${v.clueRounds}`, talk: 'Talk it over, then vote', vote: 'Who is the imposter?', guess: 'Last chance for the imposter', reveal: 'The truth' }[v.phase]
  const myTurn = v.phase === 'clue' && v.turn === ME
  return html`<div class="play2"><div class="pmain">
    <${Head} title=${`Round ${v.round + 1} of ${v.rounds}`} sub=${sub} until=${v.until} />
    ${v.phase !== 'reveal' ? html`<${Secret} v=${v} />` : ''}
    ${v.phase === 'clue' ? html`
      <p class="center">${myTurn ? html`<b>Your turn.</b> Give a one-word clue.` : html`Waiting for <${Name} id=${v.turn} />…`}</p>
      ${myTurn ? html`<${AnswerBox} key=${v.clues.length} onSend=${t => act({ a: 'clue', text: t })} placeholder="Your clue" max=${30} />` : ''}` : ''}
    ${v.phase === 'talk' ? html`<p class="center">Who gave a strange clue? Talk on your call or in the chat.</p>
      ${v.inRound ? html`<button class=${'wide big' + (v.ready[ME] ? '' : ' primary')} onClick=${() => act({ a: 'ready' })}>${v.ready[ME] ? 'Not ready yet' : 'Ready to vote'}</button>` : ''}
      <${Waiting} ids=${v.order} done=${Object.keys(v.ready).filter(k => v.ready[k])} label="ready" />` : ''}
    ${v.phase === 'vote' ? html`<div class="pick-grid">${v.order.map(id => html`<button key=${id} class=${'who' + (v.myVote === id ? ' sel' : '')} disabled=${id === ME || !v.inRound} onClick=${() => act({ a: 'vote', id })}><${Avatar} id=${id} size=${36} /><${Name} id=${id} /></button>`)}</div>
      <${Waiting} ids=${v.order} done=${v.voted} label="voted" />` : ''}
    ${v.phase === 'guess' ? html`<div class="card center"><p><${Name} id=${v.imposter} /> was caught!</p>
      ${v.imposter === ME ? html`<p>Guess the word to steal the round.</p><${AnswerBox} onSend=${t => act({ a: 'guess', text: t })} placeholder="The secret word is…" max=${40} />` : html`<p class="dim">They can still win by guessing the word…</p>`}</div>` : ''}
    ${v.phase === 'reveal' ? html`<div class="card center reveal-imp">
      <div class="small dim">The imposter was</div><div class="imp-name"><${Avatar} id=${v.imposter} size=${40} /> <${Name} id=${v.imposter} /></div>
      <p>Word: <b>${v.words.crowd}</b>${v.words.odd ? html` · imposter's word: <b>${v.words.odd}</b>` : ''}</p>
      <p>${!v.out ? 'The vote was split: nobody was caught.' : v.caught ? (v.guessed ? html`Caught, but guessed “${v.guess}”. The imposter wins!` : html`Caught!${v.guess ? ` (guessed “${v.guess}”)` : ''} The group wins.`) : html`The room voted out <${Name} id=${v.out} />. The imposter wins!`}</p>
      <div class="small dim">${Object.entries(v.votes).map(([a, b]) => `${nameOf(a)} → ${nameOf(b)}`).join(' · ')}</div>
    </div>` : ''}
    <${Clues} v=${v} />
  </div><aside class="pside"><${Scores} pts=${v.pts} gained=${v.phase === 'reveal' ? v.gained : null} /></aside></div>`
}
