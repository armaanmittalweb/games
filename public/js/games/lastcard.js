// Last Card: an Uno-style card game. Cards arrive as two-letter codes: colour (r y g b, x = wild) and value.
import { html, useState, Name, Avatar, Clock, nameOf } from '../ui.js'
import { act, ME } from '../core.js'

const COL = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue' }
const SYM = { s: '⊘', r: '⇄', d: '+2', w: 'W', f: '+4' }
const label = c => SYM[c[1]] ?? c[1]
const NAMES = { s: 'Skip', r: 'Reverse', d: 'Draw two', w: 'Wild', f: 'Wild draw four' }
const say = c => `${COL[c[0]] ?? ''} ${NAMES[c[1]] ?? c[1]}`.trim()

export function Card({ c, small, ok, onClick, dim }) {
  const wild = c[1] === 'w' || c[1] === 'f'
  const cls = `lc c-${wild && c[0] === 'x' ? 'x' : c[0]}${small ? ' sm' : ''}${ok ? ' ok' : ''}${dim ? ' dimc' : ''}`
  return html`<button class=${cls} onClick=${onClick} disabled=${!onClick} aria-label=${say(c)}><span class="lc-corner">${label(c)}</span><span class="lc-mid">${label(c)}</span></button>`
}

/** Log lines mention cards as {r7}. */
const line = text => text.split(/(\{[a-z0-9]{2}\})/).map(part => (part.startsWith('{') ? html`<${Card} c=${part.slice(1, 3)} small=${true} />` : part))

export default function LastCard({ v }) {
  const [wildAt, setWildAt] = useState(null)
  const myTurn = v.turn === ME
  const play = i => {
    const c = v.hand[i]
    if (c[0] === 'x') return setWildAt(i)
    act({ a: 'play', i })
  }
  const others = v.order.filter(id => id !== ME)
  return html`<div class="lcg">
    <div class="opps">${others.map(id => html`<div key=${id} class=${'opp' + (v.turn === id ? ' turn' : '')}>
      <${Avatar} id=${id} size=${30} /><div class="ell small"><${Name} id=${id} /></div><div class="cnt"><i class="back"></i>${v.counts[id]}</div>
      ${v.called[id] && v.counts[id] <= 2 ? html`<span class="pill hot">last card!</span>` : ''}
      ${v.exposed === id ? html`<button class="danger small" onClick=${() => act({ a: 'catch' })}>Catch!</button>` : ''}
    </div>`)}</div>
    <div class="table">
      <div class="dir" title="Direction">${v.dir === 1 ? '↻' : '↺'}</div>
      <button class="pile" onClick=${() => myTurn && !v.drawn && act({ a: 'draw' })} disabled=${!myTurn || !!v.drawn} aria-label="Draw a card"><i class="back big"></i><small>${v.pile} left</small></button>
      <div class="top-wrap"><${Card} c=${v.top} /><span class=${'cur-col c-' + v.color}>${COL[v.color]}</span></div>
      <${Clock} until=${v.until} />
    </div>
    <div class="center turn-line">${myTurn
      ? html`<b>Your turn.</b> ${v.owed ? html`Stack a card or draw ${v.owed}.` : v.drawn ? 'Play the card you drew, or pass.' : 'Play a card or draw.'}`
      : html`<${Name} id=${v.turn} />'s turn${v.owed ? ` (owes ${v.owed})` : ''}`}</div>
    <div class="hand">${v.hand.map((c, i) => html`<${Card} key=${i + c} c=${c} ok=${v.playable[i]} dim=${myTurn && !v.playable[i]} onClick=${myTurn && v.playable[i] ? () => play(i) : null} />`)}</div>
    <div class="row center-row">
      ${myTurn && v.owed ? html`<button onClick=${() => act({ a: 'draw' })}>Draw ${v.owed}</button>` : ''}
      ${myTurn && !v.owed && !v.drawn ? html`<button onClick=${() => act({ a: 'draw' })}>Draw a card</button>` : ''}
      ${myTurn && v.drawn ? html`<button onClick=${() => act({ a: 'pass' })}>Pass</button>` : ''}
      ${v.hand.length <= 2 && !v.called[ME] ? html`<button class="primary" onClick=${() => act({ a: 'last' })}>Last card!</button>` : ''}
      ${v.exposed === ME ? html`<span class="pill warn">Call it before someone catches you!</span>` : ''}
    </div>
    <div class="log small dim">${v.log.slice().reverse().map((l, i) => html`<div key=${i}>${line(l)}</div>`)}</div>
    ${wildAt !== null ? html`<div class="modal" onClick=${e => e.target === e.currentTarget && setWildAt(null)}><div class="card stack center"><b>Pick the next colour</b>
      <div class="colors">${Object.entries(COL).map(([k, n]) => html`<button key=${k} class=${'colbtn c-' + k} onClick=${() => { act({ a: 'play', i: wildAt, color: k }); setWildAt(null) }}>${n}</button>`)}</div></div></div>` : ''}
  </div>`
}

export function Summary({ inst, summary }) {
  if (!summary?.hands) return null
  return html`<div class="card"><h2>Cards left</h2>${inst.players.filter(id => summary.hands[id]?.length).map(id => html`<div key=${id} class="row wrapgap" style="margin:6px 0"><span style="min-width:90px"><${Name} id=${id} /></span>${summary.hands[id].map((c, i) => html`<${Card} key=${i} c=${c} small=${true} />`)}</div>`)}</div>`
}
