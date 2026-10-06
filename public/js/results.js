// The results screen: who won, told to you personally, with the podium rising place by place, the moments worth
// talking about (a streak, a photo finish, a new room leader), "I'm in" votes for another game, and a result card to
// share. The game's own summary, the game night table and the feedback card follow.
import { html, useState, useEffect, useRef } from './preact.js'
import { S, ME, send, toast, copy } from './core.js'
import { Avatar, Name, nameOf, colorOf, plural } from './ui.js'
import { META, placePoints, mods, GameIcon, NightTable, Feedback } from './app.js'

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
const num = x => (typeof x?.score === 'number' ? x.score : null)
const fmtNum = n => (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toFixed(1))
const and = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`)

/** The line at the top, about you: won, tied, or where you came and how far off the place above you were. */
function headline(st, winners, meta) {
  const mine = st.find(x => x.id === ME)
  if (!mine) return { big: `${and(winners.map(nameOf))} ${winners.length > 1 ? 'win' : 'wins'}!`, sub: `${meta.name} is over.`, win: false }
  const level = st.filter(x => x.place === mine.place && x.id !== ME)
  // A team game (Code Words) gives words, not numbers, and everyone on a team the same place.
  const team = num(mine) === null && level.length > 0
  if (mine.place === 1) {
    if (team) return { big: 'Your team won!', sub: `With ${and(level.map(x => nameOf(x.id)))}.`, win: true }
    if (level.length) return { big: 'You tied for 1st!', sub: `Level with ${and(level.map(x => nameOf(x.id)))}.`, win: true }
    const next = st.filter(x => x.place > 1).sort((a, b) => a.place - b.place)[0]
    const gap = next && num(mine) !== null && num(next) !== null ? num(mine) - num(next) : null
    return { big: 'You won!', sub: gap > 0 ? `${fmtNum(gap)} ahead of ${nameOf(next.id)}.` : gap === 0 ? `Level with ${nameOf(next.id)}, ahead on the tie-break.` : '', win: true }
  }
  if (team) return { big: 'Not this time', sub: `${and(winners.map(nameOf))} won it.`, win: false }
  const above = st.filter(x => x.place < mine.place).sort((a, b) => b.place - a.place)[0]
  const gap = above && num(above) !== null && num(mine) !== null ? num(above) - num(mine) : null
  const last = mine.place === Math.max(...st.map(x => x.place)) && st.length > 2
  const big = `${level.length ? 'Joint ' : 'You came '}${ordinal(mine.place)}${level.length ? ' place' : ''}`
  const sub = gap > 0 ? `${fmtNum(gap)} behind ${nameOf(above.id)}${above.place === 1 ? ' for the win' : ` for ${ordinal(above.place)}`}.` : last ? 'The next one is yours.' : ''
  return { big, sub, win: false }
}

/** What is worth talking about, from what the room already knows: up to three. Told to `me` ("You have won…"), or
 * with everyone by name when `me` is null (the shared picture). */
function moments(room, st, winners, me = ME) {
  const out = []
  const who = id => (id === me ? 'You' : nameOf(id))
  const history = room.history // newest first; this game is history[0]
  for (const w of winners) {
    let streak = 0
    while (streak < history.length && history[streak].winners.includes(w)) streak++
    const m = room.members.find(x => x.id === w)
    if (streak >= 2) out.push(['🔥', `${who(w)} ${w === me ? 'have' : 'has'} won ${streak} in a row`])
    else if (m && m.wins === 1 && m.games > 1) out.push(['🎉', `First win of the night for ${w === me ? 'you' : nameOf(w)}`])
  }
  if (winners.length > 1) out.push(['🤝', 'A dead heat at the top'])
  const [a, b] = [st.find(x => x.place === 1), st.find(x => x.place === 2)]
  if (winners.length === 1 && num(a) !== null && num(b) !== null && num(a) > num(b)) {
    const gap = num(a) - num(b)
    if (gap <= Math.max(1, num(a) * 0.05)) out.push(['📸', `Photo finish: ${fmtNum(gap)} in it`])
    else if (num(b) > 0 && num(a) >= num(b) * 2) out.push(['🚀', `Runaway win: more than double ${nameOf(b.id)}'s score`])
  }
  // The room's leaderboard before this game: take off the points this game gave.
  if (history.length > 1) {
    const gained = Object.fromEntries(st.map(x => [x.id, placePoints(x.place)]))
    const now = room.members.map(m => [m.id, m.pts]), before = room.members.map(m => [m.id, m.pts - (gained[m.id] ?? 0)])
    const top = list => { const max = Math.max(...list.map(x => x[1])); const ids = list.filter(x => x[1] === max).map(x => x[0]); return ids.length === 1 && max > 0 ? ids[0] : null }
    const lead = top(now), was = top(before)
    if (lead && lead !== was) out.push(['👑', `${who(lead)} ${lead === me ? 'lead' : 'leads'} the room now`])
  }
  return out.slice(0, 3)
}

/** Counts up to a score once the podium is up. */
function Count({ to, delay = 0 }) {
  const [v, setV] = useState(typeof to === 'number' && !still() ? 0 : to)
  useEffect(() => {
    if (typeof to !== 'number' || still()) return setV(to)
    let raf = 0
    const t0 = performance.now() + delay
    const step = t => {
      const k = Math.min(1, Math.max(0, (t - t0) / 700))
      setV(k >= 1 ? to : Math.round(to * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return html`<span>${typeof v === 'number' ? fmtNum(v) : v}</span>`
}

/** Paper confetti over the whole screen, once. Games can throw it too, in their own colours. */
export function confetti(big, colors = ['#f5c542', '#ff6b6b', '#4dabf7', '#69db7c', '#da77f2', '#ff922b']) {
  if (still()) return
  const layer = document.createElement('div')
  layer.className = 'confetti'
  layer.setAttribute('aria-hidden', 'true')
  document.body.append(layer)
  const n = big ? 120 : 60
  const W = innerWidth, H = innerHeight
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i')
    p.style.background = colors[i % colors.length]
    p.style.left = `${Math.random() * 100}%`
    if (i % 3 === 0) p.style.borderRadius = '50%'
    layer.append(p)
    const drift = (Math.random() - 0.5) * W * 0.4, spin = (Math.random() - 0.5) * 1440
    p.animate([
      { transform: 'translate(0, -20px) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${H + 40}px) rotate(${spin}deg)`, opacity: 0.9 },
    ], { duration: 1900 + Math.random() * 1500, delay: Math.random() * 450, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'both' })
  }
  setTimeout(() => layer.remove(), 4200)
}
const celebrated = new Set()

// ---------- the result card ----------

function rounded(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r)
  c.closePath()
}
const iconImage = svg => new Promise(ok => {
  const img = new Image()
  img.onload = () => ok(img)
  img.onerror = () => ok(null)
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((svg ?? '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" '))
})

/** A 1080 × 1350 picture of the result (the size WhatsApp and Instagram show whole). */
async function drawCard({ meta, st, winners, lines }) {
  const W = 1080, H = 1350
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const c = cv.getContext('2d')
  const bg = c.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#191933'); bg.addColorStop(0.55, '#2b1745'); bg.addColorStop(1, '#3b1530')
  c.fillStyle = bg; c.fillRect(0, 0, W, H)
  // Soft spotlight behind the winner.
  const glow = c.createRadialGradient(W / 2, 560, 20, W / 2, 560, 520)
  glow.addColorStop(0, 'rgba(245,197,66,.28)'); glow.addColorStop(1, 'rgba(245,197,66,0)')
  c.fillStyle = glow; c.fillRect(0, 0, W, H)
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  c.textAlign = 'center'; c.textBaseline = 'alphabetic'
  c.fillStyle = 'rgba(255,255,255,.7)'; c.font = font(700, 30)
  c.fillText('GAME NIGHT', W / 2, 92)
  const icon = await iconImage(meta.icon)
  c.font = font(800, 64)
  const titleW = c.measureText(meta.name).width
  const ix = W / 2 - (titleW + 92) / 2
  if (icon) c.drawImage(icon, ix, 128, 76, 76)
  c.fillStyle = '#fff'; c.textAlign = 'left'
  c.fillText(meta.name, ix + 92, 188)
  c.textAlign = 'center'
  c.fillStyle = '#f5c542'; c.font = font(800, 54)
  c.fillText(`${and(winners.map(nameOf))} ${winners.length > 1 ? 'win' : 'wins'}!`, W / 2, 300)

  // The podium.
  const slots = [[2, 220, 190], [1, 540, 270], [3, 860, 140]]
  const base = 900
  for (const [place, x, h] of slots) {
    const at = st.filter(s => s.place === place)
    if (!at.length) continue
    const colors = { 1: ['#f5c542', '#b8900f'], 2: ['#c9ced6', '#7d828a'], 3: ['#e0a06a', '#9a5f2e'] }[place]
    const g = c.createLinearGradient(0, base - h, 0, base)
    g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1])
    c.fillStyle = g; rounded(c, x - 140, base - h, 280, h, 18); c.fill()
    c.fillStyle = 'rgba(0,0,0,.35)'; c.font = font(900, 90); c.fillText(String(place), x, base - h / 2 + 32)
    // Above the block: the score, the name, then the avatar (with a crown for the winner).
    const p = at[0]
    const top = base - h
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = font(600, 30)
    c.fillText(String(typeof p.score === 'number' ? fmtNum(p.score) : p.score), x, top - 20)
    c.fillStyle = '#fff'; c.font = font(700, place === 1 ? 42 : 36)
    let name = at.map(s => nameOf(s.id)).join(' & ')
    while (c.measureText(name).width > 290 && name.length > 4) name = name.slice(0, -2) + '…'
    c.fillText(name, x, top - 62)
    const r = place === 1 ? 70 : 54, cy = top - 110 - r
    c.fillStyle = colorOf(p.id); c.beginPath(); c.arc(x, cy, r, 0, Math.PI * 2); c.fill()
    c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke()
    c.fillStyle = '#16161a'; c.font = font(800, r); c.fillText(nameOf(p.id).slice(0, 1).toUpperCase(), x, cy + r * 0.36)
    if (place === 1) { c.font = font(400, 64); c.fillText('👑', x, cy - r - 6) }
  }
  // Everyone else, then the moments.
  let y = 990
  const room = H - 180 // the date and the link sit below this
  const rest = st.filter(s => s.place > 3).slice(0, lines.length ? 2 : 3)
  c.font = font(600, 32)
  for (const s of rest) {
    c.fillStyle = 'rgba(255,255,255,.08)'; rounded(c, 140, y - 40, W - 280, 54, 14); c.fill()
    c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = 'left'; c.fillText(`${ordinal(s.place)}  ${nameOf(s.id)}`, 170, y - 2)
    c.textAlign = 'right'; c.fillText(String(typeof s.score === 'number' ? fmtNum(s.score) : s.score), W - 170, y - 2)
    c.textAlign = 'center'; y += 64
  }
  c.font = font(600, 34); c.fillStyle = '#fff'
  for (const [e, t] of lines) {
    if (y + 40 > room) break
    c.fillText(`${e}  ${t}`, W / 2, y + 20)
    y += 58
  }
  c.fillStyle = 'rgba(255,255,255,.6)'; c.font = font(600, 30)
  c.fillText(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, H - 112)
  c.fillStyle = '#fff'; c.font = font(800, 36)
  c.fillText('Play free with friends: games.amittal.dev', W / 2, H - 60)
  return new Promise(ok => cv.toBlob(ok, 'image/png'))
}

async function shareCard(data) {
  const blob = await drawCard(data)
  if (!blob) return toast('Could not make the picture')
  const file = new File([blob], `game-night-${data.meta.id}.png`, { type: 'image/png' })
  const text = `${and(data.winners.map(nameOf))} won ${data.meta.name} on Game Night! Play with us: ${location.origin}`
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return } catch (e) { if (e?.name === 'AbortError') return }
  }
  // No file sharing here (most laptops): save the picture and copy the line to go with it.
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  copy(text, 'Picture saved, message copied')
}

// ---------- the screen ----------

export function Results({ isHost }) {
  const s = S
  const room = s.room
  const inst = room.inst
  const meta = META[inst.id]
  const night = room.night && inst.night ? room.night : null
  const st = inst.standings ?? []
  const [mod, setMod] = useState(mods[inst.id] ?? null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!mods[inst.id]) import(`./games/${inst.id}.js`).then(m => { mods[inst.id] = m; setMod(m) }) }, [inst.id])
  const winners = st.filter(x => x.place === 1).map(x => x.id)
  const head = headline(st, winners, meta)
  const lines = moments(room, st, winners)
  const next = night && !night.done ? night.plan[night.idx + 1] ?? (night.length === 'endless' ? 'more' : null) : null
  const Summary = mod?.Summary
  const champs = night?.done ? night.champions : []
  const again = inst.again ?? []
  const seated = inst.players.includes(ME)
  const mins = inst.startedAt && inst.endedAt ? Math.max(1, Math.round((inst.endedAt - inst.startedAt) / 60000)) : null
  const key = room.code + ':' + inst.n
  useEffect(() => {
    if (celebrated.has(key)) return
    celebrated.add(key)
    const t = setTimeout(() => confetti(head.win || night?.done), 1250)
    return () => clearTimeout(t)
  }, [key])
  const card = async () => { setBusy(true); try { await shareCard({ meta, st, winners, lines: moments(room, st, winners, null) }) } finally { setBusy(false) } }
  const inBtn = html`<button class=${'grow' + (again.includes(ME) ? ' in' : ' primary')} onClick=${() => send({ t: 'again' })} aria-pressed=${again.includes(ME)}>${again.includes(ME) ? '✓ You’re in' : night && !night.done ? 'Ready for the next one' : 'I’m in for another'}</button>`
  const ready = again.length ? html`<span class="in-list" title=${again.map(nameOf).join(', ')}>${again.slice(0, 6).map(id => html`<${Avatar} key=${id} id=${id} size=${22} />`)}<span class="small">${again.length} in</span></span>` : ''

  return html`<div class="wrap results stack">
    ${night?.done ? html`<div class="card champion"><div class="trophy">🏆</div><h1>${and(champs.map(nameOf))} ${champs.length > 1 ? 'share' : 'wins'} the night!</h1><p class="dim">${night.rounds.length} games played</p></div>` : ''}
    <section class=${'card res-hero' + (head.win ? ' won' : '')}>
      <div class="res-game"><${GameIcon} m=${meta} size="small" /> ${meta.name}${mins ? ` · ${mins} min` : ''} · ${plural(inst.players.length, 'player')}</div>
      <h1 class="res-big">${head.big}</h1>
      ${head.sub ? html`<p class="res-sub">${head.sub}</p>` : ''}
      <div class="podium">${[2, 1, 3].map(p => {
        const at = st.filter(x => x.place === p)
        // Players level on a place share its step, side by side; empty steps keep the podium's shape unless nobody
        // is below 1st at all.
        if (!at.length && !st.some(x => x.place > 1)) return ''
        return at.length ? html`<div class=${'pod p' + p + (at.length > 1 ? ' tied' : '')} style=${`--n:${at.length}`}>
          <div class="pod-names">${at.map(x => html`<div key=${x.id} class=${x.id === ME ? 'me' : ''}>${p === 1 ? html`<span class="crown" aria-hidden="true">👑</span>` : ''}<${Avatar} id=${x.id} size=${p === 1 ? 48 : 36} /><div class="ell pod-name"><${Name} id=${x.id} /></div><div class="pod-score"><${Count} to=${x.score} delay=${1300} /></div></div>`)}</div>
          <div class="pod-block">${p}</div></div>` : html`<div class=${'pod p' + p + ' empty'}></div>`
      })}</div>
      ${lines.length ? html`<ul class="moments">${lines.map(([e, t], i) => html`<li key=${i} style=${`--i:${i}`}><span aria-hidden="true">${e}</span>${t}</li>`)}</ul>` : ''}
    </section>

    <div class="res-actions">
      ${isHost ? html`
        ${night && !night.done && next ? html`<button class="primary big grow" onClick=${() => send({ t: 'nightGo' })}>Next: ${next === 'more' ? 'a new game' : META[next].name}</button>` : ''}
        ${night?.done ? html`<button class="primary big grow" onClick=${() => send({ t: 'nightEnd' })}>Back to the lobby</button>` : ''}
        ${!night ? html`<button class="primary big grow" onClick=${() => send({ t: 'start', id: inst.id })}>Play again</button>` : ''}
        ${ready}
        <button class="ghost-btn" onClick=${card} disabled=${busy} aria-label="Share the result as a picture">Share result</button>
        ${!night ? html`<button class="ghost-btn" onClick=${() => send({ t: 'lobby' })}>Other game</button>` : ''}
        ${night && !night.done ? html`<button class="ghost-btn" onClick=${() => confirm('End the game night now?') && send({ t: 'nightEnd' })}>End night</button>` : ''}`
      : html`
        ${inBtn}
        ${ready}
        <button class="ghost-btn" onClick=${card} disabled=${busy} aria-label="Share the result as a picture">Share result</button>`}
    </div>
    ${!isHost ? html`<p class="dim small center nomargin">${night && !night.done ? `Up next: ${next && next !== 'more' ? META[next].name : 'another game'}. The host starts it.` : 'The host picks what is next.'}</p>` : ''}

    <div class="card">
      <table class="tbl res-table"><tr><th>#</th><th>Player</th><th>Score</th><th></th><th title="Room points">+pts</th></tr>
        ${st.map((x, i) => html`<tr key=${x.id} class=${x.id === ME ? 'me' : ''} style=${`--i:${i}`}><td>${x.place}</td><td><${Name} id=${x.id} /></td><td><b><${Count} to=${x.score} delay=${1300} /></b></td><td class="dim small">${x.detail ?? ''}</td><td class="plus">+${placePoints(x.place)}</td></tr>`)}
      </table>
    </div>
    ${Summary && html`<${Summary} inst=${inst} summary=${inst.summary} />`}
    ${seated && html`<${Feedback} key=${key} inst=${inst} code=${room.code} />`}
    ${night && html`<${NightTable} night=${night} />`}
  </div>`
}
