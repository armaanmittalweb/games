// Territory: pick a free square next to your land each turn; picks are shown together; clashes stay free.
import { html, Head, Scores, Waiting, colorOf, Name } from '../ui.js'
import { act, ME } from '../core.js'

export default function Territory({ v, inst, seated }) {
  const moves = new Set(v.moves)
  const won = new Map(v.last.won), walled = new Map(v.last.walled), clash = new Set(v.last.clash)
  const me = v.seats.indexOf(ME)
  const can = seated && v.moves.length > 0
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Turn ${v.turn}`} sub=${can ? (v.mine === null ? 'Pick a glowing square next to your land' : 'Picked. You can still change it.') : seated ? 'No free square next to your land' : 'Watching'} until=${v.until} />
      <div class="tt-frame"><div class="tt-grid" style=${`--w:${v.w}`} role="grid" aria-label="The map">
        ${v.cells.map((c, i) => {
          const owner = c >= 0 ? v.seats[c] : null
          let cls = 'tt-cell'
          if (c === -2) cls += ' rock'
          else if (owner) cls += ' owned'
          if (moves.has(i) && can) cls += ' can'
          if (v.mine === i) cls += ' picked'
          if (won.has(i)) cls += ' new'
          if (walled.has(i)) cls += ' walled'
          if (clash.has(i)) cls += ' clash'
          if (owner === ME) cls += ' me'
          return html`<button key=${i} class=${cls} style=${owner ? `--c:${colorOf(owner)}` : ''} disabled=${!(can && moves.has(i))}
            onClick=${() => act({ a: 'pick', cell: i })} aria-label=${c === -2 ? 'rock' : owner ? `owned by ${owner === ME ? 'you' : 'a player'}` : moves.has(i) ? 'free, next to your land' : 'free'}>${clash.has(i) ? '✕' : ''}</button>`
        })}
      </div></div>
      <p class="dim small center">${v.last.clash.length ? `${v.last.clash.length} square${v.last.clash.length > 1 ? 's' : ''} picked by two players stayed free (✕). ` : ''}${v.last.walled.length ? `${v.last.walled.length} walled-in square${v.last.walled.length > 1 ? 's' : ''} changed hands. ` : ''}Wall off an area and it is yours.</p>
      <${Waiting} ids=${inst.players} done=${v.picked} label="picked" />
    </div>
    <aside class="pside"><${Scores} pts=${v.counts} note=${id => html`<i class="tt-sw" style=${`--c:${colorOf(id)}`}></i>`} />
      ${me >= 0 ? html`<p class="dim small">Your colour: <i class="tt-sw" style=${`--c:${colorOf(ME)}`}></i> <${Name} id=${ME} /></p>` : ''}</aside>
  </div>`
}
