// Code Words: pick teams, then spymasters give clues and teams reveal cards.
import { html, useState, useEffect, useTick, fmt, Name, Avatar, nameOf, initialOf, member } from '../ui.js'
import { act, ME, now } from '../core.js'
import { confetti } from '../results.js'

const T = { red: 'Red', blue: 'Blue' }
const TEAM_INK = { red: ['#e5534b', '#ff8a84', '#ffffff', '#f5c542'], blue: ['#4a8fe7', '#8ab8ff', '#ffffff', '#f5c542'] }
const buzz = ms => { try { navigator.vibrate?.(ms) } catch { /* not supported */ } }
const num = n => (n === 0 ? '∞' : n)

// What a turned-over card is: an agent, a bystander, or the black card.
const ICON = {
  agent: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 9.5h14l-1.6-4.2A2 2 0 0 0 15.5 4h-7a2 2 0 0 0-1.9 1.3zM3 10.5h18v1.5H3z"/><circle cx="9" cy="14.5" r="2.4" fill="currentColor"/><circle cx="15" cy="14.5" r="2.4" fill="currentColor"/><path d="M11 14.5h2" stroke="currentColor" stroke-width="1.4"/><path fill="currentColor" d="M5 22c.6-2.6 3.5-4.2 7-4.2s6.4 1.6 7 4.2z"/></svg>`,
  neutral: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-3.6 3.8-5.6 7.5-5.6s6.7 2 7.5 5.6"/></svg>`,
  assassin: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 2a8.5 8.5 0 0 0-8.5 8.5c0 3 1.5 5 3.3 6.1V20a1 1 0 0 0 1 1h1.4v-2h1.6v2h2.4v-2h1.6v2h1.4a1 1 0 0 0 1-1v-3.4c1.8-1.1 3.3-3.1 3.3-6.1A8.5 8.5 0 0 0 12 2zM8.6 9a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm6.8 0a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM12 13.6l-1.3 2.4h2.6z"/></svg>`,
}
const iconFor = k => (k === 'red' || k === 'blue' ? ICON.agent : ICON[k])

/** What still stops the teams from starting, as the host sees it (the server checks the same). */
function missing(v, inst) {
  const here = id => member(id)?.online
  for (const t of ['red', 'blue']) {
    const spy = v.spy[t]
    if (!spy) return `${T[t]} needs a spymaster`
    if (!here(spy)) return `${T[t]}'s spymaster is away`
    if (!inst.players.some(id => v.team[id] === t && id !== spy)) return `${T[t]} needs a guesser`
  }
  return null
}

function Teams({ v, inst }) {
  const seated = inst.players.includes(ME)
  const boss = v.boss === ME
  const col = team => {
    const ids = inst.players.filter(id => v.team[id] === team)
    return html`<div class=${'team-col ' + team}>
      <h3><span>${T[team]} team</span><span class="cw-count">${ids.length}</span></h3>
      <ul class="plain">${ids.map(id => html`<li key=${id} class=${'row' + (member(id)?.online ? '' : ' away')}><${Avatar} id=${id} size=${24} /><${Name} id=${id} />${v.spy[team] === id ? html`<span class="pill cw-spy-pill">spymaster</span>` : ''}${member(id)?.online ? '' : html`<span class="dim small">away</span>`}</li>`)}</ul>
      ${!seated ? '' : v.you.team !== team ? html`<button onClick=${() => act({ a: 'team', team })}>Join ${T[team]}</button>` : html`<button class=${v.spy[team] === ME ? '' : 'primary'} onClick=${() => act({ a: 'spy' })}>${v.spy[team] === ME ? 'Stop being spymaster' : 'Be the spymaster'}</button>`}
    </div>`
  }
  const why = missing(v, inst)
  return html`<div class="cw">
    <div class="ghead"><div><div class="gtitle">Choose teams</div><div class="dim small">Pick your side and who gives the clues. Each team needs a spymaster and at least one guesser.</div></div></div>
    <div class="teams">${col('red')}${col('blue')}</div>
    ${v.black > 1 ? html`<p class="small dim center"><span class="cw-dot"></span> This board has ${v.black} black cards.</p>` : ''}
    ${boss
      ? html`${why ? html`<p class="cw-why" role="status">${why} to start.</p>` : ''}
        <div class="row cw-go"><button onClick=${() => act({ a: 'shuffle' })}>Shuffle teams</button><button class="primary big grow" disabled=${!!why} onClick=${() => act({ a: 'go' })}>Start</button></div>`
      : html`<p class="dim center cw-wait">${why ? `${why}. ` : ''}${v.boss ? html`<${Name} id=${v.boss} you=${false} /> starts the game.` : 'The host starts the game.'}</p>`}
  </div>`
}

function ClueForm() {
  const [word, setWord] = useState('')
  const [n, setN] = useState(1)
  return html`<form class="clue-form" onSubmit=${e => { e.preventDefault(); if (word.trim()) act({ a: 'clue', word: word.trim(), n }) }}>
    <input onInput=${e => setWord(e.target.value)} placeholder="One-word clue" maxlength="24" autocomplete="off" aria-label="Clue" />
    <select value=${n} onChange=${e => setN(Number(e.target.value))} aria-label="How many words">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(x => html`<option value=${x}>${num(x)}</option>`)}</select>
    <button class="primary">Give clue</button></form>`
}

/** Shows while `at` is less than `ms` old, closes early on a tap; `key` tells one showing from the next. */
function useMoment(key, at, ms) {
  const [closed, setClosed] = useState(null)
  const age = now() - (at ?? 0)
  const show = !!at && closed !== key && age < ms
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setClosed(key), ms - age)
    return () => clearTimeout(t)
  }, [key, show])
  return [show, age, () => setClosed(key)]
}

/** Why the turn moved, in a few words. */
function reason(h, turn) {
  if (!h) return `${T[turn]} goes first`
  const by = T[h.team]
  if (h.why === 'time') return `${by} ran out of time`
  if (h.why === 'pass') return `${by} ended their turn`
  if (h.why === 'done') return `${by} used every guess`
  return html`${by} picked <span class=${'cw-chip ' + h.card}>${h.word}</span>${h.card === 'neutral' ? " (nobody's word)" : ` (${T[h.card]}'s word)`}`
}

/** The whole screen turns the colour of the team now up, for a couple of seconds after every turn change. Tap to close. */
function TurnSplash({ v }) {
  const [show, age, close] = useMoment(v.turnN, v.phase === 'play' ? v.turnAt : 0, 2400)
  const mine = v.you.team === v.turn
  useEffect(() => { if (show && mine) buzz([60, 40, 60]) }, [v.turnN, show])
  if (!show) return null
  const you = !v.you.team ? '' : !mine ? 'Their turn: watch the board' : v.you.spy ? 'Your clue, spymaster' : "Wait for your spymaster's clue"
  return html`<div class=${'cw-splash ' + v.turn} style=${`--age:-${Math.round(age)}ms`} onClick=${close} role="status">
    <div class="cw-splash-why">${reason(v.handoff, v.turn)}</div>
    <div class="cw-splash-team">${T[v.turn]}</div>
    <div class="cw-splash-turn">team's turn</div>
    ${you ? html`<div class=${'cw-splash-you' + (mine ? ' mine' : '')}>${you}</div>` : ''}
  </div>`
}

/** The clue lands on everyone's screen as a card from the spymaster. */
function ClueSplash({ v }) {
  const [show, , close] = useMoment(v.clueAt, v.phase === 'play' && v.clue ? v.clueAt : 0, 2600)
  const mine = v.you.team === v.turn && !v.you.spy
  useEffect(() => { if (show && mine) buzz(80) }, [v.clueAt, show])
  if (!show) return null
  const { word, n } = v.clue
  const find = n === 0 ? 'Guess as many as you dare' : `Find ${n} word${n === 1 ? '' : 's'}`
  return html`<div class=${'cw-cluesplash ' + v.turn} onClick=${close} role="status">
    <div class="cw-cluecard">
      <div class="cw-cluecard-from">Clue from ${nameOf(v.spy[v.turn])}</div>
      <div class="cw-cluecard-word" style=${`--n:${word.length}`}>${word}</div>
      <div class="cw-cluecard-n">${num(n)}</div>
    </div>
    <div class=${'cw-splash-you' + (mine ? ' mine' : '')}>${mine ? `Your team: ${find.toLowerCase()}` : `${T[v.turn]}: ${find.toLowerCase()}`}</div>
  </div>`
}

/** The last card of the game, played big before the results take over. */
function Finale({ v }) {
  const f = v.final
  const black = f?.card === 'assassin'
  useEffect(() => {
    if (!f) return
    if (black) { buzz([250, 80, 400]); return }
    const t = setTimeout(() => confetti(true, TEAM_INK[v.winner]), 1100)
    if (v.you.team === v.winner) buzz([60, 40, 60, 40, 160])
    return () => clearTimeout(t)
  }, [f?.at])
  if (!f) return null
  const agents = v.keys.filter(k => k === v.winner).length
  const why = black ? `${T[f.by]} hit a black card`
    : f.by === v.winner ? `${T[v.winner]} found all ${agents} agents` : `${T[f.by]} turned over ${T[v.winner]}'s last agent`
  const you = !v.you.team ? '' : v.you.team === v.winner ? 'Your team won!' : 'Your team lost'
  return html`<div class=${'cw-finale ' + (black ? 'black ' : '') + v.winner} role="status">
    <div class=${'cw-finale-card ' + f.card}><span class="cw-ico">${iconFor(f.card)}</span><span>${v.words[f.i]}</span></div>
    ${black ? html`<div class="cw-finale-boom">Boom!</div>` : ''}
    <div class="cw-finale-why">${why}</div>
    <div class="cw-finale-team">${T[v.winner]}</div>
    <div class="cw-finale-wins">wins!</div>
    ${you ? html`<div class=${'cw-splash-you' + (v.you.team === v.winner ? ' mine' : '')}>${you}</div>` : ''}
  </div>`
}

/** A bar in the colour of the team on turn. With a turn timer it drains as the time runs out. */
function TurnBar({ v }) {
  useTick(250)
  const left = v.until ? v.until - now() : 0
  const total = v.until - (v.turnAt || v.until)
  const pct = v.until && total > 0 ? Math.max(0, Math.min(100, left / total * 100)) : 100
  const mine = v.you.team === v.turn
  return html`<div class=${'cw-timer ' + v.turn + (v.until && left < 10500 ? ' low' : '')} role="timer">
    <div class="cw-timer-fill" style=${`width:${pct}%`}></div>
    <span>${mine ? "Your team's turn" : `${T[v.turn]} team's turn`}</span>
    ${v.until ? html`<b aria-label="Time left">${fmt(left)}${left < 60000 ? 's' : ''}</b>` : ''}
  </div>`
}

/** The clue on turn, with a dot for every guess still allowed. */
function Clue({ v }) {
  const { word, n } = v.clue
  const free = n === 0
  return html`<div class=${'cw-clue ' + v.turn}>
    <div class="cw-clue-main"><b class="cw-clue-word">${word}</b><span class="cw-clue-n">${num(n)}</span></div>
    <div class="cw-clue-left">${free ? 'guess freely' : html`${Array.from({ length: v.left }, (_, i) => html`<i key=${i}></i>`)} <span>${v.left} guess${v.left === 1 ? '' : 'es'} left</span>`}</div>
  </div>`
}

const EYE = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`
/** A team's players under its score, spymaster first with an eye on their picture. */
const Roster = ({ v, inst, team }) => html`<div class=${'cw-roster ' + team} aria-label=${`${T[team]} team`}>${inst.players.filter(id => v.team[id] === team)
  .sort((a, b) => (v.spy[team] === b) - (v.spy[team] === a)).map(id => html`<span key=${id} class=${'cw-who' + (v.spy[team] === id ? ' spy' : '') + (id === ME ? ' me' : '')}>
    <span class="cw-av"><${Avatar} id=${id} size=${22} />${v.spy[team] === id ? html`<i class="cw-eye" title="Spymaster">${EYE}</i>` : ''}</span>
    <span class="ell">${id === ME ? 'You' : nameOf(id)}${v.spy[team] === id ? html`<span class="vh">, spymaster</span>` : ''}</span></span>`)}</div>`

const Score = ({ team, left, on }) => html`<div class=${'cw-score ' + team + (on ? ' on' : '')} aria-label=${`${T[team]}: ${left} left to find`}>
  <b>${left}</b><small>left</small></div>`

/** The final board with every card's colour. */
export function Summary({ summary }) {
  if (!summary) return null
  return html`<div class="card"><h2>${T[summary.winner]} wins: ${summary.why.toLowerCase()}</h2>
    <div class="cw-board small-board">${summary.words.map((w, i) => html`<div key=${i} class=${'cwc open ' + summary.keys[i]}><span class="cw-word" style=${`--n:${w.length}`}>${w}</span></div>`)}</div></div>`
}

export default function CodeWords({ v, inst }) {
  if (v.phase === 'teams') return html`<${Teams} v=${v} inst=${inst} />`
  const over = v.phase === 'over'
  const spy = v.you.spy
  const myTurn = !over && v.you.team === v.turn
  const guessing = myTurn && !spy && v.clue
  const last = v.log[v.log.length - 1]
  // The card turned over last flips in; at the end, the card that decided the game.
  const just = over ? v.final?.i : last?.picks[last.picks.length - 1]
  let status
  if (over) status = html`<b class=${v.winner}>${T[v.winner]} wins!</b> <span class="dim">${v.why}</span>`
  else if (v.clue) status = html`<${Clue} v=${v} />`
  else status = html`<span><b class=${v.turn}>${T[v.turn]}</b>: waiting for <${Name} id=${v.spy[v.turn]} /> to give a clue</span>`
  return html`<div class=${'cw' + (spy ? ' is-spy' : '') + (over ? ' over finale-' + (v.final?.card === 'assassin' ? 'black' : 'won') : ' turn-' + v.turn)}>
    <${TurnSplash} v=${v} />
    <${ClueSplash} v=${v} />
    ${over ? html`<${Finale} v=${v} />` : ''}
    <div class="cw-top">
      <${Score} team="red" left=${v.remaining.red} on=${!over && v.turn === 'red'} />
      <div class="grow center cw-status">${status}</div>
      <${Score} team="blue" left=${v.remaining.blue} on=${!over && v.turn === 'blue'} />
    </div>
    <div class="cw-rosters"><${Roster} v=${v} inst=${inst} team="red" /><${Roster} v=${v} inst=${inst} team="blue" /></div>
    ${over ? '' : html`<${TurnBar} v=${v} />`}
    <div class="cw-board">${v.words.map((w, i) => {
      const k = v.keys[i]
      const marks = v.marks[i] ?? []
      const open = v.open[i]
      const cls = 'cwc' + (open ? ' open ' + k : spy || over ? ' key-' + k : '') + (marks.includes(ME) ? ' marked' : marks.length ? ' eyed' : '') + (i === just ? ' just' : '')
      return html`<button key=${i} class=${cls} disabled=${!guessing || open} onClick=${() => act({ a: marks.includes(ME) ? 'pick' : 'mark', i })}>
        ${open ? html`<span class="cw-ico">${iconFor(k)}</span>` : ''}
        <span class="cw-word" style=${`--n:${w.length}`}>${w}</span>${marks.length ? html`<span class="cw-marks">${marks.map(id => html`<i key=${id} title=${nameOf(id)}>${initialOf(id)}</i>`)}</span>` : ''}</button>`
    })}</div>
    <div class="cw-bottom">
      ${myTurn && spy && !v.clue ? html`<${ClueForm} />` : ''}
      ${guessing ? html`<p class="small dim center">Tap a word to mark it, tap it again to reveal it.</p>${last?.picks.length ? html`<button onClick=${() => act({ a: 'pass' })}>End our turn</button>` : ''}` : ''}
      ${v.black > 1 ? html`<p class="small dim center"><span class="cw-dot"></span> ${v.black} black cards on this board. Any one of them loses the game.</p>` : ''}
      ${v.log.length ? html`<div class="cw-log" aria-label="Clues so far">${v.log.map((l, j) => html`<span key=${j} class=${'cw-logchip ' + l.team}>
        <b>${l.clue} ${num(l.n)}</b>${l.picks.length ? html` ${l.picks.map(i => html`<span key=${i} class=${'cw-dotw ' + v.keys[i]}>${v.words[i].toLowerCase()}</span>`)}` : ''}</span>`)}</div>` : ''}
    </div>
  </div>`
}
