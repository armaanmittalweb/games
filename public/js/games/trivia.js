// Trivia: four choices (or true or false), a clock, points for speed.
import { html, Head, Scores, Waiting, Name, useTick, Mark, RevealHead, gotIt } from '../ui.js'
import { act, now, ME } from '../core.js'

const CATS = { india: 'India', general: 'General knowledge', science: 'Science & nature', geography: 'Geography', history: 'History', screen: 'Film & TV', music: 'Music', sports: 'Sports', tech: 'Computers & gadgets', games: 'Video games' }

export default function Trivia({ v, inst, seated }) {
  useTick(200)
  const reveal = v.phase === 'reveal'
  const reading = !reveal && now() < v.opened
  const mine = v.gained?.[ME]
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Question ${v.round + 1} of ${v.rounds}`} sub=${CATS[v.cat] ?? ''} until=${reading ? 0 : v.until}>${v.streak >= 2 && !reveal ? html`<span class="pill hot">${Mark.flame()}${v.streak} in a row</span>` : ''}</${Head}>
      <div class="prompt">${v.q}</div>
      <div class=${'choices' + (v.choices.length === 2 ? ' two' : '')} style=${reading ? 'visibility:hidden' : ''}>${v.choices.map((c, i) => {
        let cls = 'choice'
        if (v.mine === i) cls += ' mine'
        if (reveal && i === v.right) cls += ' right'
        else if (reveal && v.mine === i) cls += ' wrong'
        const who = reveal ? Object.keys(v.picks).filter(id => v.picks[id] === i) : []
        return html`<button key=${i} class=${cls} disabled=${!seated || reveal || reading || v.mine !== null} onClick=${() => act({ a: 'answer', i })}>
          <span class="letter">${v.choices.length === 2 ? '' : 'ABCD'[i]}</span><span class="grow">${c}</span>
          ${who.length ? html`<span class="who-picked">${who.map(id => html`<${Name} key=${id} id=${id} you=${false} />`)}</span>` : ''}</button>`
      })}</div>
      ${reading ? html`<p class="center dim">Read the question…</p>` : ''}
      ${!reveal ? html`<${Waiting} ids=${inst.players} done=${v.answered} />` : ''}
      ${reveal ? html`<${RevealHead} head=${gotIt(Object.values(v.picks).filter(i => i === v.right).length, inst.players.length)}
        sub=${!seated ? '' : mine ? html`<span class="ok">Right! +${mine} for you</span>` : v.mine === null ? 'You did not answer' : 'Not this time for you'} />` : ''}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? v.gained : null} /></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => v.right === null ? null : { text: `Answer: ${v.choices[v.right]}`, pts: v.gained?.[ME] ?? 0, good: (v.gained?.[ME] ?? 0) > 0 }
