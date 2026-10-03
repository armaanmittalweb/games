'use strict'
// Word Race client. The server owns the game: it picks the words, checks guesses and keeps the clock.

const $app = document.getElementById('app')
const $toast = document.getElementById('toast')
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

let me = { id: store.get('wr.id', ''), secret: store.get('wr.secret', '') }
if (!me.id) { me = { id: rand(8), secret: rand(16) }; store.set('wr.id', me.id); store.set('wr.secret', me.secret) }

const MODES = {
  marathon: { name: 'Marathon', what: 'Same words, same order for everyone. Solve as many as you can before the timer ends. 6 points for a first-try solve down to 1 for a sixth-try solve.', ties: 'Points, then words solved, then fewer guesses, then whoever solved their last word earlier.' },
  race: { name: 'Race', what: 'Same words, same order. First to clear the whole pool wins. Miss a word (or skip it) and you move on without it.', ties: 'Words solved, then whoever got there first, then fewer guesses.' },
  survival: { name: 'Survival', what: 'Same words, same order. Miss one word and you are out. Last one standing with the most words wins.', ties: 'Words solved, then fewer guesses, then whoever got there first.' },
  blitz: { name: 'Blitz', what: 'Everyone plays the same word at the same time, round by round. 7 minus your guesses, plus 3/2/1 bonus for the first three to solve.', ties: 'Points, then rounds won (first to solve), then less total solve time, then fewer guesses.' },
}

let S = null // last state from the server
let offset = 0 // server clock minus ours
let ws = null, wsCode = null, retry = 0, pingT = null
let input = ''
let seen = '' // idx:guesses of the last state, to clear the input when a guess lands
let shake = false

const now = () => Date.now() + offset
function toast(msg, ms = 1600) {
  $toast.textContent = msg; $toast.hidden = false
  clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true }, ms)
}
const fmt = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const secs = ms => (ms / 1000).toFixed(1) + 's'

// ---------- routing ----------
const HOME_TITLE = document.title
function route() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{5})\/?$/)
  document.body.dataset.view = m ? 'room' : 'home'
  if (m) {
    const code = m[1].toUpperCase()
    document.title = `Room ${code} · Word Race`
    if (!store.get('wr.name', '')) return renderName(code)
    connect(code)
  } else {
    document.title = HOME_TITLE
    disconnect()
    renderHome()
    // /?solo=1 (the Play solo links on the guide pages): start a solo game straight away once there is a name.
    if (new URLSearchParams(location.search).get('solo') === '1') {
      history.replaceState(null, '', '/')
      if (store.get('wr.name', '')) createRoom(true)
      else toast('Enter your name, then tap Play solo', 2600)
    }
  }
}
window.addEventListener('popstate', () => { route(); countView() })
const go = path => { history.pushState(null, '', path); route(); countView() }

// Anonymous page-view count for the Switchboard (api.amittal.dev/hit): the page and the referring site, no cookies
// or ids. Room codes are left out of the path. Skipped off amittal.dev and in automated browsers.
let viewed = ''
function countView() {
  if (!navigator.sendBeacon || navigator.webdriver || !location.hostname.endsWith('amittal.dev')) return
  const path = location.pathname.startsWith('/r/') ? '/r/' : location.pathname
  if (path === viewed) return
  const ref = viewed ? '' : document.referrer
  viewed = path
  try { navigator.sendBeacon('https://api.amittal.dev/hit', JSON.stringify({ s: 'games', p: path, r: ref })) } catch { /* never break the page */ }
}

// ---------- home ----------
function renderHome() {
  $app.innerHTML = `
  <div class="wrap stack" style="max-width:460px">
    <div><h1>Multiplayer Wordle with friends</h1><p class="dim">Make a room, share the code, race through the same words.</p></div>
    <div class="card stack">
      <div><label for="name">Your name</label><input id="name" maxlength="16" autocomplete="nickname" value="${esc(store.get('wr.name', ''))}" placeholder="e.g. Armaan"></div>
      <button class="primary" id="create" style="width:100%">Create a room</button>
      <button id="solo" style="width:100%">Play solo</button>
    </div>
    <div class="card stack">
      <label for="code" style="margin-top:0">Have a code?</label>
      <div class="row"><input class="grow" id="code" maxlength="5" placeholder="ABCDE" style="text-transform:uppercase;letter-spacing:3px" autocapitalize="characters" autocomplete="off"><button id="join">Join</button></div>
    </div>
    <p class="home-links"><a href="/how-to-play">How to play</a><a href="/game-modes">Game modes</a><a href="/wordle-tips">Best starting words</a></p>
  </div>`
  const name = () => { const n = document.getElementById('name').value.trim(); if (!n) { toast('Enter your name first'); return null } store.set('wr.name', n); return n }
  document.getElementById('create').onclick = () => { if (name()) createRoom(false) }
  document.getElementById('solo').onclick = () => { if (name()) createRoom(true) }
  const join = () => {
    const c = document.getElementById('code').value.trim().toUpperCase()
    if (!name()) return
    if (!/^[A-Z0-9]{5}$/.test(c)) return toast('Codes are 5 characters')
    go('/r/' + c)
  }
  document.getElementById('join').onclick = join
  document.getElementById('code').onkeydown = e => { if (e.key === 'Enter') join() }
}

/** Makes a room and goes to it. A solo room starts its game as soon as it opens. */
async function createRoom(solo) {
  document.querySelectorAll('#create, #solo').forEach(b => { b.disabled = true })
  try {
    const r = await fetch('/api/rooms', { method: 'POST' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'Could not make a room')
    autostart = solo ? j.code : null
    go('/r/' + j.code)
  } catch (err) {
    toast(err.message)
    document.querySelectorAll('#create, #solo').forEach(b => { b.disabled = false })
  }
}
let autostart = null

function renderName(code) {
  $app.innerHTML = `
  <div class="wrap stack" style="max-width:460px">
    <h1>Join a Word Race room</h1>
    <div class="card stack">
      <p>Joining room <b style="letter-spacing:3px">${esc(code)}</b></p>
      <div><label for="name">Your name</label><input id="name" maxlength="16" autocomplete="nickname" placeholder="e.g. Armaan" autofocus></div>
      <button class="primary" id="go" style="width:100%">Join</button>
    </div>
  </div>`
  const submit = () => {
    const n = document.getElementById('name').value.trim()
    if (!n) return toast('Enter your name')
    store.set('wr.name', n)
    connect(code)
  }
  document.getElementById('go').onclick = submit
  document.getElementById('name').onkeydown = e => { if (e.key === 'Enter') submit() }
}

// ---------- connection ----------
function connect(code) {
  if (ws && wsCode === code) return
  disconnect()
  wsCode = code
  if (!S) $app.innerHTML = `<div class="wrap"><p class="dim">Connecting to ${esc(code)}…</p></div>`
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const sock = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws`)
  ws = sock
  sock.onopen = () => {
    retry = 0
    sock.send(JSON.stringify({ t: 'join', id: me.id, secret: me.secret, name: store.get('wr.name', '') }))
    clearInterval(pingT); pingT = setInterval(() => { try { sock.send('ping') } catch { /* closed */ } }, 25000)
  }
  sock.onmessage = e => {
    if (e.data === 'pong') return
    const m = JSON.parse(e.data)
    if (m.t === 'state') onState(m)
    else if (m.t === 'bad') { toast(m.msg); shake = true; render() }
    else if (m.t === 'error') toast(m.msg, 2200)
  }
  sock.onclose = e => {
    if (ws !== sock) return
    ws = null
    clearInterval(pingT)
    if (e.code === 4000) { $app.innerHTML = `<div class="wrap"><p>This room is open in another tab.</p><button onclick="location.reload()">Use it here</button></div>`; return }
    if (e.code === 4001) { S = null; toast('The host removed you'); go('/'); return }
    if (!S && retry > 1) { $app.innerHTML = `<div class="wrap stack"><p>Room <b>${esc(code)}</b> not found. Rooms close a day after the last game.</p><button onclick="history.pushState(null,'','/');location.reload()">Back</button></div>`; return }
    const wait = Math.min(8000, 500 * 2 ** retry++)
    setTimeout(() => { if (wsCode === code && !ws) { wsCode = null; connect(code) } }, wait)
  }
}
function disconnect() {
  const s = ws; ws = null; wsCode = null; S = null
  clearInterval(pingT)
  if (s) try { s.close() } catch { /* closed */ }
}
const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else toast('Reconnecting…') }

function onState(m) {
  offset = m.now - Date.now()
  const prev = S
  S = m
  const key = `${m.game}:${m.round}:${m.me.idx}:${m.me.guesses.length}`
  if (key !== seen) { seen = key; input = '' }
  if (prev && prev.phase !== m.phase && m.phase === 'done') toast('Game over', 1200)
  if (autostart === m.code && m.host === m.you && m.phase === 'lobby') { autostart = null; send({ t: 'start' }) }
  render()
}

// ---------- room ----------
function render() {
  if (!S) return
  // Keep focus and caret in an input across re-renders.
  const a = document.activeElement
  const keep = a && a.id && (a.tagName === 'INPUT' || a.tagName === 'SELECT') ? { id: a.id, v: a.value, s: a.selectionStart } : null
  const isHost = S.host === S.you
  let body = ''
  if (S.phase === 'lobby') body = lobby(isHost)
  else if (S.phase === 'done') body = results(isHost)
  else body = game(isHost)
  $app.innerHTML = topbar() + body + overlays()
  if (keep) {
    const el = document.getElementById(keep.id)
    if (el) { el.value = keep.v; el.focus(); try { if (keep.s != null) el.setSelectionRange(keep.s, keep.s) } catch { /* number input */ } }
  }
  bind(isHost)
  shake = false
  tickTimers()
}

function topbar() {
  const mode = MODES[S.config.mode]
  return `<div class="bar">
    <button class="link" data-act="home" title="Leave" aria-label="Leave the room">←</button>
    <span class="code">${esc(S.code)}</span>
    <button class="link" data-act="share">Share link</button>
    <span class="pill">${mode.name}</span>
    <span class="timer" id="timer"></span>
  </div>`
}

function lobby(isHost) {
  const c = S.config
  const players = S.players.slice().sort((a, b) => (b.id === S.host) - (a.id === S.host))
  const modeBtns = Object.entries(MODES).map(([k, m]) => `<button class="mode ${c.mode === k ? 'sel' : ''}" data-mode="${k}" ${isHost ? '' : 'disabled'}><b>${m.name}</b><span class="small dim">${m.what}</span></button>`).join('')
  return `<div class="wrap grid2">
    <div class="card">
      <h2>Players (${S.players.length})</h2>
      <ul class="players">${players.map(p => `<li><span class="dot ${p.online ? 'on' : ''}"></span><span class="${p.id === S.you ? 'you' : ''}">${esc(p.name)}</span>${p.id === S.host ? ' <span class="pill">host</span>' : ''}
        ${isHost && p.id !== S.you ? `<span style="margin-left:auto"><button class="link" data-host="${p.id}">make host</button><button class="link" data-kick="${p.id}">remove</button></span>` : ''}</li>`).join('')}</ul>
      <p class="dim small" style="margin-top:12px">Send friends the link or the code <b style="letter-spacing:2px">${esc(S.code)}</b>. Anyone can join, even mid-game.</p>
    </div>
    <div class="card stack">
      <h2>Game settings ${isHost ? '' : '<span class="dim small">(the host picks)</span>'}</h2>
      <div class="modes">${modeBtns}</div>
      <div class="row">
        <div class="grow"><label for="cw">${c.mode === 'blitz' ? 'Rounds' : 'Words in the pool'}</label><input id="cw" type="number" min="1" max="50" value="${c.words}" ${isHost ? '' : 'disabled'} inputmode="numeric"></div>
        ${c.mode === 'blitz'
          ? `<div class="grow"><label for="cr">Seconds per round</label><input id="cr" type="number" min="20" max="300" value="${c.roundSeconds}" ${isHost ? '' : 'disabled'} inputmode="numeric"></div>`
          : `<div class="grow"><label for="cm">Time limit (minutes)</label><input id="cm" type="number" min="1" max="60" value="${c.minutes}" ${isHost ? '' : 'disabled'} inputmode="numeric"></div>`}
      </div>
      <p class="small dim"><b>Tie-break:</b> ${MODES[c.mode].ties}</p>
      ${isHost ? `<button class="primary" data-act="start" style="width:100%">Start game</button>` : `<p class="dim">Waiting for the host to start…</p>`}
    </div>
  </div>`
}

function boardHtml() {
  const g = S.me.guesses, mk = S.me.marks
  const blitz = S.config.mode === 'blitz'
  const done = blitz ? !!(S.players.find(p => p.id === S.you)?.results?.[S.round]) : false
  let rows = ''
  for (let r = 0; r < 6; r++) {
    let cells = ''
    const typing = r === g.length && !done
    for (let i = 0; i < 5; i++) {
      if (r < g.length) cells += `<div class="tile t${mk[r][i]}">${g[r][i]}</div>`
      else if (typing && input[i]) cells += `<div class="tile filled">${input[i]}</div>`
      else cells += `<div class="tile"></div>`
    }
    rows += `<div class="brow ${typing && shake ? 'shake' : ''}">${cells}</div>`
  }
  return `<div class="board">${rows}</div>`
}

function keyboardHtml() {
  const best = {}
  S.me.guesses.forEach((w, r) => [...w].forEach((ch, i) => { best[ch] = Math.max(best[ch] ?? -1, S.me.marks[r][i]) }))
  const row = (keys, last) => `<div class="kr">${last ? '<button class="k wide" data-key="Enter" aria-label="Enter">Enter</button>' : ''}${[...keys].map(k => `<button class="k ${best[k] !== undefined ? 't' + best[k] : ''}" data-key="${k}" aria-label="${k}${best[k] === 2 ? ', right place' : best[k] === 1 ? ', in the word' : best[k] === 0 ? ', not in the word' : ''}">${k}</button>`).join('')}${last ? '<button class="k wide" data-key="Backspace" aria-label="Delete letter">⌫</button>' : ''}</div>`
  return `<div class="kb">${row('qwertyuiop')}${row('asdfghjkl')}${row('zxcvbnm', true)}</div>`
}

function standingsHtml() {
  const blitz = S.config.mode === 'blitz'
  const total = S.total || 1
  return `<ul class="stand">${S.players.map(p => {
    const scoreTxt = S.config.mode === 'marathon' || blitz ? `${p.points} pts` : `${p.solved}/${total}`
    const lastMarks = p.marks.length ? p.marks[p.marks.length - 1] : null
    const mini = `<span class="mini">${[0, 1, 2, 3, 4].map(i => `<i class="${lastMarks ? 't' + lastMarks[i] : ''}"></i>`).join('')}</span>`
    let state = ''
    if (p.out) state = '<span class="small" style="color:#ff8a80">out</span>'
    else if (p.finished) state = '<span class="small" style="color:#8fd18a">done</span>'
    else if (blitz && p.results[S.round]) state = p.results[S.round].solved ? `<span class="small" style="color:#8fd18a">solved in ${p.results[S.round].tries}</span>` : '<span class="small" style="color:#ff8a80">missed</span>'
    else state = `<span class="small dim">${p.marks.length}/6</span> ${mini}`
    const pct = blitz ? (S.round / total) * 100 : (Math.min(p.idx, total) / total) * 100
    return `<li><span class="place">${p.place}</span><span class="name ${p.id === S.you ? 'you' : ''}"><span class="dot ${p.online ? 'on' : ''}" style="display:inline-block;margin-right:6px"></span>${esc(p.name)}</span><span class="score">${scoreTxt}</span>
      <span class="prog">${blitz ? '' : `<span class="bar-bg"><span class="bar-fg" style="width:${pct}%;display:block"></span></span><span class="small dim">${Math.min(p.idx + 1, total)}/${total}</span>`} ${state}</span></li>`
  }).join('')}</ul>`
}

function game(isHost) {
  const mine = S.players.find(p => p.id === S.you)
  const blitz = S.config.mode === 'blitz'
  const total = S.total
  const finished = mine && (mine.out || mine.finished)
  const lastIdx = S.me.idx - 1
  const lastWord = !blitz && lastIdx >= 0 ? S.me.words[lastIdx] : null
  const lastRes = !blitz && lastIdx >= 0 ? mine.results[lastIdx] : null
  let status = blitz ? `<b>Round ${S.round + 1}/${total}</b>` : `<b>Word ${Math.min(S.me.idx + 1, total)}/${total}</b>`
  if (lastWord && lastRes && !finished) status += ` <span class="small ${lastRes.solved ? '' : 'dim'}">last: <b style="text-transform:uppercase">${esc(lastWord)}</b> ${lastRes.solved ? '✓' : '✗'}</span>`
  let main
  if (finished) {
    main = `<div class="card" style="margin-top:20px;text-align:center"><h2>${mine.out ? 'You are out' : 'You finished!'}</h2>
      ${lastWord ? `<p>Last word: <b style="text-transform:uppercase">${esc(lastWord)}</b></p>` : ''}
      <p>${mine.solved}/${total} solved${S.config.mode === 'marathon' ? ` · ${mine.points} points` : ''}</p><p class="dim">Waiting for the others or the timer…</p></div>`
  } else {
    main = `${boardHtml()}${keyboardHtml()}`
  }
  return `<div class="game">
    <div class="play">
      <div class="status">${status}
        ${!blitz && !finished ? '<button class="link" data-act="skip">skip word</button>' : ''}
        ${isHost ? '<button class="link" data-act="end">end game</button>' : ''}
      </div>
      ${main}
    </div>
    <div class="side card" style="padding:8px 12px">${standingsHtml()}</div>
  </div>`
}

function overlays() {
  if (S.phase === 'playing' && now() < S.startedAt) return `<div class="overlay"><div style="text-align:center"><div class="big" id="count"></div><p class="dim">${MODES[S.config.mode].name} · ${S.total} ${S.config.mode === 'blitz' ? 'rounds' : 'words'}</p></div></div>`
  if (S.phase === 'reveal') {
    const rows = S.players.filter(p => p.results[S.round]).map(p => ({ p, r: p.results[S.round] })).sort((a, b) => (a.r.place ?? 99) - (b.r.place ?? 99))
    return `<div class="overlay"><div class="card reveal" style="min-width:min(360px,90vw)">
      <p class="dim">Round ${S.round + 1} word</p><div class="word">${esc(S.reveal || '')}</div>
      <table style="margin-top:10px">${rows.map(({ p, r }) => `<tr><td>${esc(p.name)}</td><td class="${r.solved ? 'ok' : 'miss'}">${r.solved ? `${r.tries} tries · ${secs(r.at)}` : 'missed'}</td><td>+${r.pts}</td></tr>`).join('')}</table>
      <p class="dim small">${S.round + 1 < S.total ? 'Next word in <span id="rev"></span>' : 'Final results in <span id="rev"></span>'}</p></div></div>`
  }
  return ''
}

function results(isHost) {
  const mode = S.config.mode
  const blitz = mode === 'blitz'
  const top = S.players.filter(p => p.place === 1)
  const winner = top.length > 1 ? `Tie: ${top.map(p => esc(p.name)).join(' & ')}` : top.length ? `${esc(top[0].name)} wins!` : 'No players'
  const cols = mode === 'marathon' ? ['Points', 'Solved', 'Guesses', 'Last solve']
    : mode === 'race' ? ['Solved', 'Finished at', 'Guesses']
    : mode === 'survival' ? ['Solved', 'Guesses', 'Last solve']
    : ['Points', 'Firsts', 'Solve time', 'Guesses']
  const val = p => mode === 'marathon' ? [p.points, p.solved, p.tries, p.solved ? secs(p.lastSolveAt) : '–']
    : mode === 'race' ? [p.solved, p.solved ? secs(p.lastSolveAt) : '–', p.tries]
    : mode === 'survival' ? [p.solved + (p.out ? ' (out)' : ''), p.tries, p.solved ? secs(p.lastSolveAt) : '–']
    : [p.points, p.firsts, secs(p.solveMs), p.tries]
  const words = S.words || []
  return `<div class="wrap stack">
    <div class="card"><div class="winner">🏆 ${winner}</div><p class="dim small"><b>Tie-break:</b> ${MODES[mode].ties}</p></div>
    <div class="card scroll"><table>
      <tr><th>#</th><th>Player</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>
      ${S.players.map(p => `<tr><td>${p.place}</td><td class="${p.id === S.you ? 'you' : ''}">${esc(p.name)}</td>${val(p).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}
    </table></div>
    <div class="card scroll"><h2>Every word</h2><table>
      <tr><th>Word</th>${S.players.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr>
      ${words.map((w, i) => `<tr><td style="text-transform:uppercase;font-weight:700">${esc(w)}</td>${S.players.map(p => {
        const r = p.results[i]
        if (!r) return '<td class="dim">–</td>'
        return r.solved ? `<td class="ok">${r.tries}${blitz && r.place ? ` · #${r.place}` : ''} · ${secs(r.at)}</td>` : `<td class="miss">✗</td>`
      }).join('')}</tr>`).join('')}
    </table></div>
    <div class="row"><button data-act="result">Share result</button></div>
    ${isHost ? `<div class="row"><button class="primary" data-act="start">Play again (same settings)</button><button data-act="lobby">Change settings</button></div>` : '<p class="dim">The host can start another game.</p>'}
  </div>`
}

/** A spoiler-free summary: one square per word (green solved, red missed), place and score, and a link. */
function resultText() {
  const p = S.players.find(q => q.id === S.you)
  const mode = MODES[S.config.mode].name
  const squares = (S.words || []).map((_, i) => { const r = p.results[i]; return r ? (r.solved ? '🟩' : '🟥') : '⬜' }).join('')
  const score = S.config.mode === 'marathon' || S.config.mode === 'blitz' ? `${p.points} pts` : `${p.solved}/${S.total} words`
  const place = S.players.length > 1 ? `#${p.place} of ${S.players.length} · ` : ''
  return `Word Race · ${mode}\n${place}${score}\n${squares}\nhttps://games.amittal.dev`
}

// ---------- events ----------
function bind(isHost) {
  $app.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => act(b.dataset.act) })
  $app.querySelectorAll('[data-key]').forEach(b => { b.onclick = () => key(b.dataset.key) })
  $app.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => send({ t: 'config', config: { ...S.config, mode: b.dataset.mode } }) })
  $app.querySelectorAll('[data-kick]').forEach(b => { b.onclick = () => { if (confirm('Remove this player?')) send({ t: 'kick', id: b.dataset.kick }) } })
  $app.querySelectorAll('[data-host]').forEach(b => { b.onclick = () => send({ t: 'host', id: b.dataset.host }) })
  if (isHost) {
    const num = (id, field) => { const el = document.getElementById(id); if (el) el.onchange = () => send({ t: 'config', config: { ...S.config, [field]: Number(el.value) } }) }
    num('cw', 'words'); num('cm', 'minutes'); num('cr', 'roundSeconds')
  }
}

async function act(a) {
  if (a === 'home') { if (S && S.phase === 'playing' && !confirm('Leave the game?')) return; go('/') }
  else if (a === 'share') {
    const url = `${location.origin}/r/${S.code}`
    if (navigator.share) { try { await navigator.share({ title: 'Word Race', text: `Join my Word Race room ${S.code}`, url }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); toast('Link copied') } catch { prompt('Copy this link', url) }
  }
  else if (a === 'result') {
    const text = resultText()
    if (navigator.share) { try { await navigator.share({ text }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); toast('Result copied') } catch { prompt('Copy your result', text) }
  }
  else if (a === 'start') send({ t: 'start' })
  else if (a === 'lobby') send({ t: 'lobby' })
  else if (a === 'end') { if (confirm('End the game for everyone now?')) send({ t: 'end' }) }
  else if (a === 'skip') { if (confirm(S.config.mode === 'survival' ? 'Skipping counts as a miss and you will be out. Skip?' : 'Skip this word? It counts as missed.')) send({ t: 'skip' }) }
}

function canType() {
  if (!S || S.phase !== 'playing' || now() < S.startedAt) return false
  const mine = S.players.find(p => p.id === S.you)
  if (!mine || mine.out || mine.finished) return false
  if (S.config.mode === 'blitz' && mine.results[S.round]) return false
  return S.me.guesses.length < 6
}

function key(k) {
  if (!canType()) return
  if (k === 'Enter') {
    if (input.length < 5) { toast('Not enough letters'); shake = true; render(); return }
    send({ t: 'guess', word: input })
    return
  }
  if (k === 'Backspace') input = input.slice(0, -1)
  else if (/^[a-z]$/.test(k) && input.length < 5) input += k
  else return
  render()
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
  const k = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.toLowerCase()
  if (k === 'Enter' || k === 'Backspace' || /^[a-z]$/.test(k)) {
    if (canType()) { e.preventDefault(); key(k) }
  }
})

// ---------- clocks ----------
let lastPhaseKey = ''
function tickTimers() {
  if (!S) return
  const t = now()
  const el = document.getElementById('timer')
  if (el) {
    let left = null
    if (S.phase === 'playing') left = S.config.mode === 'blitz' ? S.roundEndsAt - Math.max(t, S.startedAt) : S.endsAt - Math.max(t, S.startedAt)
    el.textContent = left == null ? (S.phase === 'done' ? 'Finished' : S.phase === 'lobby' ? 'Lobby' : '') : fmt(left)
    el.classList.toggle('low', left != null && left < 15000)
  }
  const c = document.getElementById('count')
  if (c) c.textContent = Math.max(1, Math.ceil((S.startedAt - t) / 1000))
  const r = document.getElementById('rev')
  if (r) r.textContent = fmt(S.revealUntil - t)
  // Re-render once when the countdown ends.
  const pk = `${S.phase}:${S.phase === 'playing' && t < S.startedAt}`
  if (pk !== lastPhaseKey) { const was = lastPhaseKey; lastPhaseKey = pk; if (was) render() }
}
setInterval(tickTimers, 250)

route()
countView()
