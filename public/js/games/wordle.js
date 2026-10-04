// Word Race: multiplayer Wordle. The server checks every guess; this screen is the board and the keyboard.
import { html, useState, useEffect, useRef, Name, Clock, useTick, fmt } from '../ui.js'
import { act, now, onEvent, ME, share, toast } from '../core.js'

const MODES = { marathon: 'Marathon', race: 'Race', survival: 'Survival', blitz: 'Blitz' }
const secs = ms => (ms / 1000).toFixed(1) + 's'

function Board({ guesses, marks, input, done, shake }) {
  const rows = []
  for (let r = 0; r < 6; r++) {
    const typing = r === guesses.length && !done
    const cells = []
    for (let i = 0; i < 5; i++) {
      if (r < guesses.length) cells.push(html`<div class=${'tile t' + marks[r][i]}>${guesses[r][i]}</div>`)
      else if (typing && input[i]) cells.push(html`<div class="tile filled">${input[i]}</div>`)
      else cells.push(html`<div class="tile"></div>`)
    }
    rows.push(html`<div class=${'brow' + (typing && shake ? ' shake' : '')}>${cells}</div>`)
  }
  return html`<div class="board">${rows}</div>`
}

function Keyboard({ guesses, marks, onKey }) {
  const best = {}
  guesses.forEach((w, r) => [...w].forEach((ch, i) => { best[ch] = Math.max(best[ch] ?? -1, marks[r][i]) }))
  const key = k => html`<button class=${'k' + (best[k] !== undefined ? ' t' + best[k] : '')} onClick=${() => onKey(k)} aria-label=${k}>${k}</button>`
  return html`<div class="kb">
    <div class="kr">${[...'qwertyuiop'].map(key)}</div>
    <div class="kr">${[...'asdfghjkl'].map(key)}</div>
    <div class="kr"><button class="k wide" onClick=${() => onKey('Enter')}>Enter</button>${[...'zxcvbnm'].map(key)}<button class="k wide" onClick=${() => onKey('Backspace')} aria-label="Delete letter">⌫</button></div>
  </div>`
}

function Standings({ v }) {
  const blitz = v.mode === 'blitz'
  return html`<ul class="stand">${v.players.map(p => {
    const score = v.mode === 'marathon' || blitz ? `${p.points} pts` : `${p.solved}/${v.total}`
    let state
    if (p.out) state = html`<span class="small bad">out</span>`
    else if (p.finished) state = html`<span class="small ok">done</span>`
    else if (blitz && p.results[v.round]) state = p.results[v.round].solved ? html`<span class="small ok">solved in ${p.results[v.round].tries}</span>` : html`<span class="small bad">missed</span>`
    else state = html`<span class="small dim">${p.tries}/6</span> <span class="mini">${[0, 1, 2, 3, 4].map(i => html`<i class=${p.marks ? 't' + p.marks[i] : ''}></i>`)}</span>`
    return html`<li key=${p.id}><span class="place">${p.place}</span><span class="name ell"><${Name} id=${p.id} /></span><span class="score">${score}</span>
      <span class="prog">${blitz ? '' : html`<span class="small dim">${Math.min(p.idx + 1, v.total)}/${v.total}</span>`} ${state}</span></li>`
  })}</ul>`
}

export default function Wordle({ v, seated }) {
  useTick(250)
  const [input, setInput] = useState('')
  const [shake, setShake] = useState(false)
  const me = v.me
  const mine = v.players.find(p => p.id === ME)
  const blitz = v.mode === 'blitz'
  const t = now()
  const counting = t < v.startedAt
  const finished = mine && (mine.out || mine.finished)
  const roundDone = blitz && mine && mine.results[v.round]
  const can = seated && me && v.phase === 'playing' && !counting && !finished && !roundDone && me.guesses.length < 6

  // A guess landed (or the word moved on): clear what was typed.
  const key = me ? `${v.round}:${me.idx}:${me.guesses.length}` : ''
  useEffect(() => setInput(''), [key])
  useEffect(() => onEvent(ev => { if (ev.k === 'error') { setShake(true); setTimeout(() => setShake(false), 400) } }), [])

  const ref = useRef()
  ref.current = { can, input }
  const press = k => {
    const { can, input } = ref.current
    if (!can) return
    if (k === 'Enter') {
      if (input.length < 5) { toast('Not enough letters'); setShake(true); setTimeout(() => setShake(false), 400); return }
      act({ a: 'guess', word: input })
    } else if (k === 'Backspace') setInput(input.slice(0, -1))
    else if (/^[a-z]$/.test(k) && input.length < 5) setInput(input + k)
  }
  useEffect(() => {
    const on = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tg = e.target
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return
      const k = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.toLowerCase()
      if ((k === 'Enter' || k === 'Backspace' || /^[a-z]$/.test(k)) && ref.current.can) { e.preventDefault(); press(k) }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  const lastIdx = me ? me.idx - 1 : -1
  const lastWord = !blitz && lastIdx >= 0 ? me.words[lastIdx] : null
  const lastRes = lastWord && mine ? mine.results[lastIdx] : null
  const until = v.phase === 'playing' ? (blitz ? v.roundEndsAt : v.endsAt) : 0
  return html`<div class="wordle">
    <div class="play">
      <div class="status">
        <b>${blitz ? `Round ${v.round + 1}/${v.total}` : `Word ${Math.min((me?.idx ?? 0) + 1, v.total)}/${v.total}`}</b>
        <span class="pill">${MODES[v.mode]}</span>
        ${lastWord && lastRes && !finished ? html`<span class="small dim">last: <b class="up">${lastWord}</b> ${lastRes.solved ? '✓' : '✗'}</span>` : ''}
        ${!blitz && !finished && seated ? html`<button class="link" onClick=${() => confirm(v.mode === 'survival' ? 'Skipping counts as a miss and you will be out. Skip?' : 'Skip this word? It counts as missed.') && act({ a: 'skip' })}>skip word</button>` : ''}
        <${Clock} until=${counting ? 0 : until} />
      </div>
      ${finished || !me
        ? html`<div class="card center done-card"><h2>${!me ? 'You are watching' : mine.out ? 'You are out' : 'You finished!'}</h2>
            ${lastWord ? html`<p>Last word: <b class="up">${lastWord}</b></p>` : ''}
            ${mine ? html`<p>${mine.solved}/${v.total} solved${v.mode === 'marathon' ? ` · ${mine.points} points` : ''}</p>` : ''}<p class="dim">Waiting for the others or the clock…</p></div>`
        : html`<${Board} guesses=${me.guesses} marks=${me.marks} input=${input} done=${!can && !counting} shake=${shake} /><${Keyboard} guesses=${me.guesses} marks=${me.marks} onKey=${press} />`}
    </div>
    <div class="side card"><${Standings} v=${v} /></div>
    ${counting ? html`<div class="overlay"><div class="center"><div class="huge">${Math.max(1, Math.ceil((v.startedAt - t) / 1000))}</div><p class="dim">${MODES[v.mode]} · ${v.total} ${blitz ? 'rounds' : 'words'}</p></div></div>` : ''}
    ${v.phase === 'reveal' ? html`<div class="overlay"><div class="card center reveal">
      <p class="dim">Round ${v.round + 1} word</p><div class="word">${v.reveal}</div>
      <table class="tbl">${v.players.filter(p => p.results[v.round]).sort((a, b) => (a.results[v.round].place ?? 99) - (b.results[v.round].place ?? 99)).map(p => {
        const r = p.results[v.round]
        return html`<tr key=${p.id}><td><${Name} id=${p.id} /></td><td class=${r.solved ? 'ok' : 'bad'}>${r.solved ? `${r.tries} tries · ${secs(r.at)}` : 'missed'}</td><td>+${r.pts}</td></tr>`
      })}</table>
      <p class="dim small">${v.round + 1 < v.total ? 'Next word in' : 'Results in'} ${fmt(v.revealUntil - t)}</p></div></div>` : ''}
  </div>`
}

/** After the game: every word, and how each player did on it. */
export function Summary({ inst, summary }) {
  if (!summary) return null
  const ids = inst.players
  const blitz = inst.config.mode === 'blitz'
  const text = () => {
    const r = summary.results[ME] ?? []
    const squares = summary.words.map((_, i) => (r[i] ? (r[i].solved ? '🟩' : '🟥') : '⬜')).join('')
    const st = inst.standings.find(x => x.id === ME)
    return `Word Race · ${MODES[inst.config.mode]}\n${st ? `#${st.place} of ${ids.length} · ${st.score}` : ''}\n${squares}\nhttps://games.amittal.dev`
  }
  return html`<div class="card"><div class="row between"><h2 class="nomargin">Every word</h2>${ids.includes(ME) ? html`<button onClick=${() => share(text())}>Share result</button>` : ''}</div>
    <div class="scroll"><table class="tbl"><tr><th>Word</th>${ids.map(id => html`<th key=${id}><${Name} id=${id} you=${false} /></th>`)}</tr>
      ${summary.words.map((w, i) => html`<tr key=${i}><td class="up"><b>${w}</b></td>${ids.map(id => {
        const r = summary.results[id]?.[i]
        if (!r) return html`<td class="dim">–</td>`
        return r.solved ? html`<td class="ok">${r.tries}${blitz && r.place ? ` · #${r.place}` : ''}${r.at ? ` · ${secs(r.at)}` : ''}</td>` : html`<td class="bad">✗</td>`
      })}</tr>`)}
    </table></div></div>`
}
