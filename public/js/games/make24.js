// 24 Game: tap a number, an operation and another number to combine them; make the last number 24.
import { html, Head, Scores, Waiting, Name, useState, useEffect } from '../ui.js'
import { act, ME } from '../core.js'

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))
const fr = (n, d) => { if (d < 0) { n = -n; d = -d } const g = gcd(n, d) || 1; return [n / g, d / g] }
// The same rules as the server (src/games/make24.ts): the two numbers go, their result joins the end of the list.
const OPS = {
  '+': (a, b) => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]),
  '-': (a, b) => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]),
  '×': (a, b) => fr(a[0] * b[0], a[1] * b[1]),
  '÷': (a, b) => (b[0] === 0 ? null : fr(a[0] * b[1], a[1] * b[0])),
}
const show = v => (v[1] === 1 ? String(v[0]) : `${v[0]}/${v[1]}`)
const LEVEL = ['', 'Easy', 'Medium', 'Hard']

function Board({ nums, round }) {
  const start = () => nums.map(n => ({ v: [n, 1], label: String(n) }))
  const [list, setList] = useState(start)
  const [steps, setSteps] = useState([])
  const [history, setHistory] = useState([])
  const [sel, setSel] = useState(null)
  const [op, setOp] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { setList(start()); setSteps([]); setHistory([]); setSel(null); setOp(null); setMsg('') }, [round])

  const tapCard = i => {
    setMsg('')
    if (sel === null || op === null) return setSel(sel === i ? null : i)
    if (i === sel) return setSel(null)
    const v = OPS[op](list[sel].v, list[i].v)
    if (!v) { setMsg('You cannot divide by zero'); return }
    const step = { a: sel, o: op, b: i }
    const next = [...list.filter((_, k) => k !== sel && k !== i), { v, label: show(v), made: `${list[sel].label} ${op} ${list[i].label}` }]
    setHistory([...history, list])
    setList(next)
    setSteps([...steps, step])
    setSel(null)
    setOp(null)
    if (next.length === 1) {
      if (v[0] === 24 && v[1] === 1) act({ a: 'solve', steps: [...steps, step] })
      else setMsg(`That makes ${show(v)}, not 24. Undo and try another way.`)
    }
  }
  const undo = () => {
    if (!history.length) return
    setList(history[history.length - 1]); setHistory(history.slice(0, -1)); setSteps(steps.slice(0, -1)); setSel(null); setOp(null); setMsg('')
  }
  const reset = () => { setList(start()); setSteps([]); setHistory([]); setSel(null); setOp(null); setMsg('') }
  useEffect(() => {
    const onKey = e => {
      const k = { '+': '+', '-': '-', '*': '×', x: '×', '/': '÷' }[e.key]
      if (k && sel !== null) { setOp(k); e.preventDefault() }
      else if (e.key === 'Backspace') { undo(); e.preventDefault() }
      else if (/^[1-4]$/.test(e.key) && Number(e.key) <= list.length) tapCard(Number(e.key) - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return html`<div class="m24">
    <div class="m24-cards">${list.map((c, i) => html`<button key=${i + ':' + c.label + ':' + list.length} class=${'m24-card' + (sel === i ? ' sel' : '') + (c.made ? ' made' : '')} onClick=${() => tapCard(i)}>
      <span class="m24-n">${c.label}</span>${c.made ? html`<span class="m24-from">${c.made}</span>` : ''}</button>`)}</div>
    <div class="m24-ops">${Object.keys(OPS).map(o => html`<button key=${o} class=${'m24-op' + (op === o ? ' sel' : '')} disabled=${sel === null} onClick=${() => setOp(op === o ? null : o)} aria-label=${{ '+': 'plus', '-': 'minus', '×': 'times', '÷': 'divided by' }[o]}>${o === '-' ? '−' : o}</button>`)}</div>
    <p class="center dim small">${msg ? html`<span class="bad">${msg}</span>` : sel === null ? 'Tap a number' : op === null ? 'Now tap + − × or ÷' : 'Now tap the second number'}</p>
    <div class="row center-row"><button onClick=${undo} disabled=${!history.length}>Undo</button><button onClick=${reset} disabled=${!history.length}>Start again</button></div>
  </div>`
}

export default function Make24({ v, inst, seated }) {
  const reveal = v.phase === 'reveal'
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Hand ${v.round + 1} of ${v.rounds}`} sub=${`Make 24 · ${LEVEL[v.level]}`} until=${v.until} />
      ${!reveal && seated && v.mine === null ? html`<${Board} nums=${v.nums} round=${v.round} />` : ''}
      ${!reveal && v.mine !== null ? html`<div class="prompt">24! <span class="plus">in ${(v.mine / 1000).toFixed(1)} s</span><div class="dim small">Waiting for the others…</div></div>` : ''}
      ${!reveal && !seated ? html`<div class="m24-cards">${v.nums.map((n, i) => html`<span key=${i} class="m24-card"><span class="m24-n">${n}</span></span>`)}</div>` : ''}
      ${reveal ? html`<div class="answer-reveal"><div class="dim small">One way</div><div class="big-num">${v.answer} = 24</div></div>
        <table class="tbl">${Object.entries(v.times).sort((a, b) => a[1] - b[1]).map(([id, ms], i) => html`<tr key=${id}><td>${i + 1}</td><td><${Name} id=${id} /></td><td>${(ms / 1000).toFixed(1)} s</td><td class="plus">+${v.gained[id]}</td></tr>`)}</table>
        ${!Object.keys(v.times).length ? html`<p class="dim center">Nobody made 24 this time.</p>` : ''}` : ''}
      ${!reveal ? html`<${Waiting} ids=${inst.players} done=${v.solved} label="made 24" />` : ''}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? v.gained : null} /></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => v.answer ? { text: `One way: ${v.answer}`, pts: v.gained?.[ME] ?? 0, good: (v.gained?.[ME] ?? 0) > 0 } : null
