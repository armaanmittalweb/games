// Auction: raise the bid before the clock runs out; collect sets; coins left over count too.
import { html, Head, Scores, Name, useState } from '../ui.js'
import { act, ME } from '../core.js'

function LotCard({ lot, big }) {
  return html`<div class=${'au-lot' + (big ? ' big' : '')}>
    <span class="chip">${lot.set}</span>
    <div class="au-name">${lot.name}</div>
    <div class="au-pts">${lot.pts === null ? html`<b>?</b> mystery: worth 0 to 20` : html`<b>${lot.pts}</b> points`}</div>
  </div>`
}

export default function Auction({ v, inst, seated }) {
  const [custom, setCustom] = useState('')
  const mine = v.coins[ME] ?? 0
  const sold = v.phase === 'sold'
  const topMe = v.top === ME
  const bid = to => act({ a: 'bid', to })
  const collected = id => {
    const by = {}
    for (const l of v.won[id] ?? []) (by[l.set] ??= []).push(l)
    return by
  }
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Lot ${v.idx + 1} of ${v.total}`} sub="Top bid when the clock stops wins" until=${v.until} />
      <${LotCard} lot=${v.lot} big />
      <div class="au-bid">
        <div><div class="dim small">${sold ? (v.top ? 'Sold to' : 'Nobody bid') : 'Top bid'}</div>
          <div class="big-num">${v.bid ? `${v.bid}` : '—'} <span class="small">coins</span></div>
          ${v.top ? html`<div><${Name} id=${v.top} /></div>` : ''}</div>
        ${seated ? html`<div class="au-wallet"><div class="dim small">You have</div><div class="big-num">${mine}</div></div>` : ''}
      </div>
      ${!sold && seated ? html`<div class="au-raise">
        ${v.raises.map(r => html`<button key=${r} class="primary" disabled=${topMe || v.bid + r > mine} onClick=${() => act({ a: 'bid', by: r })}>+${r}</button>`)}
        <form class="au-custom" onSubmit=${e => { e.preventDefault(); const n = Number(custom); if (n > v.bid) { bid(n); e.currentTarget.querySelector('input').value = ''; setCustom('') } }}>
          <input inputmode="numeric" maxlength="6" onInput=${e => setCustom(e.target.value.replace(/\D/g, ''))} placeholder=${`${v.bid + 1}+`} aria-label="Your bid" />
          <button disabled=${topMe || !(Number(custom) > v.bid && Number(custom) <= mine)}>Bid</button></form>
      </div>
      ${topMe ? html`<p class="center plus">You are the top bid</p>`
        : v.bid + Math.min(...v.raises) > mine ? html`<p class="center au-why">You have ${mine} coins, not enough to beat ${v.bid}. Keep them for a later lot: every 10 left at the end is a point.</p>` : ''}` : ''}
      ${v.log.length ? html`<ol class="au-log">${v.log.slice().reverse().slice(0, 5).map((b, i) => html`<li key=${i}><${Name} id=${b.id} /> ${b.bid}</li>`)}</ol>` : ''}
      ${v.next.length ? html`<div><div class="dim small">Coming up</div><div class="au-next">${v.next.map((l, i) => html`<${LotCard} key=${i} lot=${l} />`)}</div></div>` : ''}
      <details class="au-rules"><summary class="small">How points work</summary><p class="small">Each lot is worth its points. Three lots from the same set: +10. Every 10 coins left at the end: +1. Mystery lots show their worth once sold.</p></details>
    </div>
    <aside class="pside">
      <${Scores} pts=${v.scores} note=${id => html`<span class="dim small">${v.coins[id]}c</span>`} />
      <div class="au-coll">${inst.players.map(id => {
        const by = collected(id)
        const sets = Object.keys(by)
        return sets.length ? html`<div key=${id}><${Name} id=${id} />${sets.map(s => html`<div key=${s} class="small"><span class=${by[s].length >= 3 ? 'plus' : 'dim'}>${s} ${by[s].length}/3</span></div>`)}</div>` : ''
      })}</div>
    </aside>
  </div>`
}

export function Summary({ summary }) {
  if (!summary?.sold) return null
  return html`<div class="card"><h2>Every lot</h2><table class="tbl">${summary.sold.map((s, i) => html`<tr key=${i}><td>${s.name}<div class="dim small">${s.set} · ${s.pts} pts</div></td><td>${s.to ? html`<${Name} id=${s.to} />` : html`<span class="dim">unsold</span>`}</td><td>${s.to ? `${s.price}c` : ''}</td></tr>`)}</table></div>`
}
