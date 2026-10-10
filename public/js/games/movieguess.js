// Movie Guess: emojis first, then the story, then a famous line or the letters. Type the film's name.
import { html, Head, Scores, Name, AnswerBox, Waiting, useEffect } from '../ui.js'
import { act, onEvent, toast, ME } from '../core.js'

export default function MovieGuess({ v, inst, seated }) {
  useEffect(() => onEvent(e => { if (e.k === 'close') toast('So close! Check the spelling.') }), [])
  const reveal = v.phase === 'reveal'
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Film ${v.round + 1} of ${v.rounds}`} sub=${reveal ? '' : `Worth ${v.worth} now`} until=${v.until} />
      <div class="mv-card">
        <div class="mv-emoji" aria-label=${`Emoji clue: ${v.emoji}`}>${v.emoji}</div>
        ${v.story ? html`<p class="mv-story">${v.story}</p>` : html`<p class="dim small center">The story comes next…</p>`}
        ${v.line ? html`<p class="mv-line">“${v.line}”</p>` : ''}
        ${v.letters ? html`<p class="mv-letters" aria-label="Letters hint">${v.letters}</p>` : ''}
        ${v.year && !reveal ? html`<p class="dim small center">Released in ${v.year}</p>` : ''}
        ${reveal ? html`<div class="answer-reveal"><div class="dim small">The film</div><div class="big-num">${v.title}</div><div class="dim small">${v.year}</div></div>` : ''}
      </div>
      ${!reveal && seated && !v.mine ? html`<${AnswerBox} key=${v.round} onSend=${t => act({ a: 'guess', text: t })} placeholder="Name the film" label="Guess" />` : ''}
      ${!reveal && v.mine ? html`<p class="center plus">You got it! Waiting for the others…</p>` : ''}
      <div class="mv-feed" aria-live="polite">${v.feed.slice(-8).map((f, i) => html`<div key=${i} class=${f.got ? 'plus' : ''}><${Name} id=${f.id} you=${false} /> ${f.got ? 'got it!' : html`<span class="dim">${f.text}</span>`}</div>`)}</div>
      ${!reveal ? html`<${Waiting} ids=${inst.players} done=${v.got} label="got it" />` : ''}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? v.gained : null} />
      <p class="dim small">10 points on the emojis alone, 6 after the story, 3 after the last clue.</p></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => v.title ? { text: `It was ${v.title}${v.year ? ` (${v.year})` : ''}`, pts: v.gained?.[ME] ?? 0, good: (v.gained?.[ME] ?? 0) > 0 } : null
