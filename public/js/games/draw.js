// Draw & Guess: the drawer draws, everyone else guesses in the feed.
import { html, useState, useEffect, useRef, Canvas, Head, Scores, Name, AnswerBox, nameOf, Mark } from '../ui.js'
import { act, onEvent, ME } from '../core.js'

/** The guesses so far this turn (the room sends them as events, not in the state). */
function useLines(turn) {
  const [lines, setLines] = useState([])
  useEffect(() => setLines([]), [turn])
  useEffect(() => onEvent(ev => {
    if (ev.k === 'msg') setLines(l => [...l.slice(-60), { id: ev.id, text: ev.text, inside: ev.inside }])
    else if (ev.k === 'got') setLines(l => [...l.slice(-60), { id: ev.id, got: true }])
    else if (ev.k === 'close') setLines(l => [...l.slice(-60), { close: ev.text }])
  }), [])
  return lines
}

const Line = ({ l }) => l.got
  ? html`<div class="fl got"><${Name} id=${l.id} you=${false} /> guessed the word!</div>`
  : l.close ? html`<div class="fl close">“${l.close}” is close!</div>`
  : html`<div class=${'fl' + (l.inside ? ' inside' : '')}><${Name} id=${l.id} you=${false} /> ${l.text}</div>`

function Feed({ lines }) {
  const box = useRef()
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [lines.length])
  return html`<div class="feed" ref=${box}>${lines.map((l, i) => html`<${Line} key=${i} l=${l} />`)}
    ${!lines.length ? html`<div class="dim small">Guesses appear here.</div>` : ''}</div>`
}

/** The newest three guesses over the bottom of the drawing; shown only while a phone keyboard leaves no room for the feed. */
const Peek = ({ lines }) => html`<div class="feed-peek" aria-hidden="true">${lines.slice(-3).map((l, i) => html`<${Line} key=${lines.length - 3 + i} l=${l} />`)}</div>`

export default function Draw({ v, inst, seated }) {
  const lines = useLines(v.turn)
  const drawing = v.drawer === ME
  const got = v.guessed[ME] !== undefined
  let sub = ''
  if (v.phase === 'choose') sub = drawing ? 'Pick a word to draw' : `${nameOf(v.drawer)} is picking a word`
  else if (v.phase === 'draw') sub = drawing ? 'Draw it! No letters or numbers' : `${nameOf(v.drawer)} is drawing`
  else sub = 'Time is up'
  return html`<div class="draw-wrap">
    <div class="draw-main">
      <${Head} title=${`Round ${Math.min(v.round, v.rounds)} of ${v.rounds}`} sub=${sub} until=${v.until} />
      <div class="hint">${v.phase === 'draw' ? (v.word && (drawing || got) ? html`<b>${v.word}</b>` : html`<span class="letters">${[...(v.hint ?? '')].map(ch => html`<i class=${ch === ' ' ? 'sp' : ''}>${ch === '_' ? '' : ch}</i>`)}</span> <span class="dim small">${(v.hint ?? '').replace(/[^_a-z]/gi, '').length} letters</span>`) : v.phase === 'reveal' ? html`The word was <b>${v.word}</b>` : ''}</div>
      ${v.phase === 'choose' && drawing ? html`<div class="choose">${v.choices.map((w, i) => html`<button key=${i} class="primary big" onClick=${() => act({ a: 'choose', i })}>${w}</button>`)}</div>` : ''}
      <div class="draw-stage"><${Canvas} k=${v.turn} strokes=${v.strokes} edit=${drawing && v.phase === 'draw'} live=${!drawing} send=${act} />${drawing ? '' : html`<${Peek} lines=${lines} />`}</div>
      ${v.phase === 'reveal' ? html`<div class="turn-pts">${Object.entries(v.turnPts).sort((a, b) => b[1] - a[1]).map(([id, p]) => html`<span key=${id}><${Name} id=${id} /> +${p}</span>`)}${!Object.keys(v.turnPts).length ? html`<span class="dim">Nobody got it.</span>` : ''}</div>` : ''}
    </div>
    <aside class="draw-side">
      <${Scores} pts=${v.pts} gained=${v.phase === 'reveal' ? v.turnPts : null} note=${id => (id === v.drawer ? html`<span title="Drawing">${Mark.pencil()}</span>` : v.guessed[id] !== undefined ? '✓' : '')} />
      <${Feed} lines=${lines} />
      ${seated ? html`<${AnswerBox} onSend=${t => act({ a: 'guess', text: t })} placeholder=${drawing || got ? 'Chat with others who know' : 'Type your guess'} max=${60} autoFocus=${!drawing} />` : ''}
    </aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => v.phase === 'reveal' && v.word ? { text: `The word was ${v.word}`, pts: v.turnPts?.[ME] ?? 0, good: (v.turnPts?.[ME] ?? 0) > 0 } : null
