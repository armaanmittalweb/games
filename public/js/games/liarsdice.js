// Liar's Dice: your dice, the bid on the table, raise or call.
import { html, useState, useEffect, Name, Avatar, Clock, nameOf, plural } from '../ui.js'
import { act, ME } from '../core.js'

const SPOTS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]
/** A die drawn with pips, so faces read at any size. */
const Die = ({ f, hit, small }) => html`<span class=${'die' + (hit ? ' hit' : '') + (small ? ' sm' : '')} role="img" aria-label=${`a ${f}`}>${Array.from({ length: 9 }, (_, i) => html`<i class=${SPOTS[f].includes(i) ? 'on' : ''}></i>`)}</span>`

export default function LiarsDice({ v }) {
  const myTurn = v.turn === ME && v.phase === 'bid'
  const minF = v.wild ? 2 : 1
  const start = () => (v.bid ? (v.bid.f < 6 ? { q: v.bid.q, f: v.bid.f + 1 } : { q: v.bid.q + 1, f: minF }) : { q: 1, f: minF })
  const [q, setQ] = useState(start().q)
  const [f, setF] = useState(start().f)
  const key = `${v.round}:${v.bids.length}`
  useEffect(() => { const s = start(); setQ(s.q); setF(s.f) }, [key])
  const valid = !v.bid || q > v.bid.q || (q === v.bid.q && f > v.bid.f)
  const show = v.phase === 'show'
  const c = v.call
  const counts = f2 => (d => d === f2 || (v.wild && d === 1))
  return html`<div class="ld">
    <div class="opps">${v.alive.map(id => html`<div key=${id} class=${'opp' + (v.turn === id && !show ? ' turn' : '')}>
      <${Avatar} id=${id} size=${30} /><div class="ell small"><${Name} id=${id} /></div>
      <div class="dice-row">${show ? v.all[id].map((d, i) => html`<${Die} key=${i} f=${d} small=${true} hit=${counts(c.bid.f)(d)} />`) : Array.from({ length: v.counts[id] }, (_, i) => html`<span key=${i} class="die sm hidden">?</span>`)}</div>
    </div>`)}</div>
    <div class="ld-mid">
      ${v.bid && !show ? html`<div class="bid-now"><span class="dim small">Bid on the table</span><div><b>${v.bid.q} ×</b> <${Die} f=${v.bid.f} /></div><span class="small">by <${Name} id=${v.bid.by} /></span></div>` : ''}
      ${!v.bid && !show ? html`<p class="dim">No bid yet. <${Name} id=${v.turn} /> opens.</p>` : ''}
      ${show ? html`<div class="card center">
        <p><${Name} id=${c.by} /> ${c.auto ? 'ran out of time and called' : 'called'} <b>liar</b> on ${c.bid.q} × <${Die} f=${c.bid.f} small=${true} /></p>
        <p class="big-num">${c.actual} × <${Die} f=${c.bid.f} /></p><p class="small dim">${plural(c.actual, 'die', 'dice')} counted${v.wild && c.bid.f !== 1 ? ', ones included' : ''}. The bid was ${c.bid.q}.</p>
        <p><${Name} id=${c.loser} /> loses a die.</p></div>` : ''}
      <${Clock} until=${v.until} />
      <div class="dim small">${plural(v.total, 'die', 'dice')} on the table${v.wild ? ' · ones are wild' : ''}</div>
    </div>
    ${v.mine ? html`<div class="ld-mine"><span class="dim small">Your dice</span><div class="dice-row big">${v.mine.map((d, i) => html`<${Die} key=${i} f=${d} />`)}</div></div>` : html`<p class="center dim">${v.out.includes(ME) ? 'You are out. Watch the rest.' : ''}</p>`}
    ${myTurn ? html`<div class="bidder card">
      <div class="row center-row">
        <button onClick=${() => setQ(Math.max(1, q - 1))} aria-label="Fewer">−</button><b class="q">${q}</b><button onClick=${() => setQ(Math.min(v.total, q + 1))} aria-label="More">+</button>
        <span>×</span>
        <div class="faces">${[1, 2, 3, 4, 5, 6].filter(x => x >= minF).map(x => html`<button key=${x} class=${'face' + (f === x ? ' sel' : '')} onClick=${() => setF(x)} aria-label=${`Face ${x}`}><${Die} f=${x} small=${true} /></button>`)}</div>
      </div>
      <div class="row center-row"><button class="primary big" disabled=${!valid} onClick=${() => act({ a: 'bid', q, f })}>Bid ${q} × ${f}s</button>${v.bid ? html`<button class="danger big" onClick=${() => act({ a: 'liar' })}>Liar!</button>` : ''}</div>
    </div>` : !show ? html`<p class="center dim">Waiting for <${Name} id=${v.turn} />…</p>` : ''}
    ${v.bids.length && !show ? html`<div class="small dim center">${v.bids.map(b => `${nameOf(b.by)}: ${b.q} × ${b.f}s`).join(' → ')}</div>` : ''}
  </div>`
}
