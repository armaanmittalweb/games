// Code Words: pick teams, then spymasters give clues and teams reveal cards.
import { html, useState, Name, Avatar, Clock, nameOf } from '../ui.js'
import { act, ME } from '../core.js'

const T = { red: 'Red', blue: 'Blue' }

function Teams({ v, inst }) {
  const col = team => html`<div class=${'team-col ' + team}>
    <h3>${T[team]} team</h3>
    <ul class="plain">${inst.players.filter(id => v.team[id] === team).map(id => html`<li key=${id} class="row"><${Avatar} id=${id} size=${24} /><${Name} id=${id} />${v.spy[team] === id ? html`<span class="pill">spymaster</span>` : ''}</li>`)}</ul>
    ${v.you.team !== team ? html`<button onClick=${() => act({ a: 'team', team })}>Join ${T[team]}</button>` : html`<button class=${v.spy[team] === ME ? '' : 'primary'} onClick=${() => act({ a: 'spy' })}>${v.spy[team] === ME ? 'Stop being spymaster' : 'Be the spymaster'}</button>`}
  </div>`
  return html`<div class="stack">
    <div class="ghead"><div><div class="gtitle">Choose teams</div><div class="dim small">Each team needs a spymaster and at least one guesser.</div></div></div>
    <div class="teams">${col('red')}${col('blue')}</div>
    <div class="row"><button onClick=${() => act({ a: 'shuffle' })}>Shuffle teams</button><button class="primary big grow" onClick=${() => act({ a: 'go' })}>Start</button></div>
  </div>`
}

function ClueForm() {
  const [word, setWord] = useState('')
  const [n, setN] = useState(1)
  return html`<form class="clue-form" onSubmit=${e => { e.preventDefault(); if (word.trim()) act({ a: 'clue', word: word.trim(), n }) }}>
    <input value=${word} onInput=${e => setWord(e.target.value)} placeholder="One-word clue" maxlength="24" autocomplete="off" aria-label="Clue" />
    <select value=${n} onChange=${e => setN(Number(e.target.value))} aria-label="How many words">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(x => html`<option value=${x}>${x === 0 ? '∞' : x}</option>`)}</select>
    <button class="primary">Give clue</button></form>`
}

/** The final board with every card's colour. */
export function Summary({ summary }) {
  if (!summary) return null
  return html`<div class="card"><h2>${T[summary.winner]} wins: ${summary.why.toLowerCase()}</h2>
    <div class="cw-board small-board">${summary.words.map((w, i) => html`<div key=${i} class=${'cwc open ' + summary.keys[i]}><span class="cw-word">${w}</span></div>`)}</div></div>`
}

export default function CodeWords({ v, inst }) {
  if (v.phase === 'teams') return html`<${Teams} v=${v} inst=${inst} />`
  const over = v.phase === 'over'
  const spy = v.you.spy
  const myTurn = !over && v.you.team === v.turn
  const guessing = myTurn && !spy && v.clue
  const last = v.log[v.log.length - 1]
  let status
  if (over) status = html`<b class=${v.winner}>${T[v.winner]} wins!</b> <span class="dim">${v.why}</span>`
  else if (!v.clue) status = html`<b class=${v.turn}>${T[v.turn]}</b>: waiting for <${Name} id=${v.spy[v.turn]} /> to give a clue`
  else status = html`<b class=${v.turn}>${T[v.turn]}</b>: <span class="clue big">${v.clue.word} ${v.clue.n === 0 ? '∞' : v.clue.n}</span> <span class="dim small">${v.left > 20 ? 'guess freely' : `${v.left} guess${v.left === 1 ? '' : 'es'} left`}</span>`
  return html`<div class=${'cw' + (spy ? ' is-spy' : '')}>
    <div class="cw-top">
      <span class="score-red">${v.remaining.red}</span><div class="grow center">${status}</div><span class="score-blue">${v.remaining.blue}</span>
      ${v.until ? html`<${Clock} until=${v.until} />` : ''}
    </div>
    <div class="cw-board">${v.words.map((w, i) => {
      const k = v.keys[i]
      const marks = v.marks[i] ?? []
      const cls = 'cwc' + (v.open[i] ? ' open ' + k : spy || over ? ' key-' + k : '') + (marks.includes(ME) ? ' marked' : '')
      return html`<button key=${i} class=${cls} disabled=${!guessing || v.open[i]} onClick=${() => act({ a: marks.includes(ME) ? 'pick' : 'mark', i })}>
        <span class="cw-word">${w}</span>${marks.length ? html`<span class="cw-marks">${marks.map(id => html`<i key=${id} title=${nameOf(id)}>${nameOf(id).slice(0, 1)}</i>`)}</span>` : ''}</button>`
    })}</div>
    <div class="cw-bottom">
      ${myTurn && spy && !v.clue ? html`<${ClueForm} />` : ''}
      ${guessing ? html`<p class="small dim center">Tap a word to mark it, tap it again to reveal it.</p>${last?.picks.length ? html`<button onClick=${() => act({ a: 'pass' })}>End our turn</button>` : ''}` : ''}
      ${!over && !myTurn ? html`<p class="small dim center">${T[v.turn]} team's turn.</p>` : ''}
      <div class="cw-teams small">
        ${['red', 'blue'].map(t => html`<span key=${t} class=${t}>${T[t]}: ${inst.players.filter(id => v.team[id] === t).map(id => nameOf(id) + (v.spy[t] === id ? ' (spymaster)' : '')).join(', ')}</span>`)}
      </div>
      ${v.log.length ? html`<details class="small"><summary>Clues so far</summary><ul class="plain">${v.log.map((l, j) => html`<li key=${j}><b class=${l.team}>${l.clue} ${l.n === 0 ? '∞' : l.n}</b>: ${l.picks.map(i => v.words[i]).join(', ') || '–'}</li>`)}</ul></details>` : ''}
    </div>
  </div>`
}
