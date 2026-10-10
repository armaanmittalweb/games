// Most Likely To: everyone points at someone at once.
import { html, Head, Scores, Waiting, Name, Avatar, nameOf, plural, Mark } from '../ui.js'
import { act, ME } from '../core.js'

export default function MostLikely({ v, inst, seated }) {
  const voting = v.phase === 'vote'
  const ranked = inst.players.slice().sort((a, b) => (v.counts[b]?.length ?? 0) - (v.counts[a]?.length ?? 0))
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Round ${v.round + 1} of ${v.rounds}`} sub="Vote with the room to score" until=${v.until} />
      <div class="prompt"><span class="dim small">Who is most likely to…</span><br />${v.prompt}?</div>
      ${voting ? html`
        <div class="pick-grid">${inst.players.map(id => html`<button key=${id} class=${'who' + (v.mine === id ? ' sel' : '')} disabled=${!seated} onClick=${() => act({ a: 'vote', id })}>
          <${Avatar} id=${id} size=${40} /><${Name} id=${id} /></button>`)}</div>
        <${Waiting} ids=${inst.players} done=${v.voted} label="voted" />`
      : html`<div class="votes">
        ${v.top.length ? html`<p class="center top-pick">${Mark.crown()} ${v.top.map((id, i) => html`${i ? ' & ' : ''}<${Name} key=${id} id=${id} />`)}</p>` : html`<p class="center dim">No clear winner this time.</p>`}
        ${ranked.filter(id => v.counts[id]).map(id => html`<div key=${id} class=${'vrow' + (v.top.includes(id) ? ' top' : '')}>
          <${Avatar} id=${id} /><div class="grow"><div><${Name} id=${id} /> <span class="dim small">${plural(v.counts[id].length, 'vote')}</span></div>
          <div class="dim small">from ${v.counts[id].map(x => (x === ME ? 'you' : nameOf(x))).join(', ')}</div></div>
          <span class="bar-v"><i style=${`width:${(v.counts[id].length / inst.players.length) * 100}%`}></i></span></div>`)}
        ${v.mine && v.top.includes(v.mine) ? html`<p class="center plus">You voted with the room: +2</p>` : ''}</div>`}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} note=${id => (v.crowns[id] ? html`<span class="crowns" title="Times the room picked them">${Mark.crown()}${v.crowns[id] > 1 ? v.crowns[id] : ''}</span>` : '')} /></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => v.phase !== 'reveal' ? null : { text: v.top.length ? `The room picked ${v.top.map(nameOf).join(' & ')}` : 'The room was split', pts: v.top.includes(v.mine) ? 2 : 0, good: v.top.includes(v.mine) }
