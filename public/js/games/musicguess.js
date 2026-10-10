// Music Guess: the clip plays by itself (or on a tap if the browser asks); pick the song from four.
import { html, Head, Scores, Name, Waiting, useEffect, useRef, useState } from '../ui.js'
import { act, ME } from '../core.js'

/** Plays `secs` seconds of the preview from `at`. Resolves false if the browser blocked it (no tap yet). */
async function playClip(audio, at, secs) {
  if (!audio) return false
  if (audio.readyState < 1) await new Promise(r => { audio.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 4000) })
  clearTimeout(audio._stop)
  audio.currentTime = at
  try { await audio.play() } catch { return false }
  audio._stop = setTimeout(() => audio.pause(), secs * 1000)
  return true
}

export default function MusicGuess({ v, inst, seated }) {
  const audio = useRef()
  const [blocked, setBlocked] = useState(false)
  const [failed, setFailed] = useState(false)
  const reveal = v.phase === 'reveal'
  const play = secs => playClip(audio.current, v.at, secs).then(ok => setBlocked(!ok))
  // A new song: load it and play the short clip. The long clip plays once when it unlocks; the reveal plays more.
  useEffect(() => { setFailed(false); const a = audio.current; if (a) { a.src = v.preview; a.load(); play(v.clip) } }, [v.round])
  useEffect(() => { if (v.long && !reveal) play(v.clip) }, [v.long])
  useEffect(() => { if (reveal) play(10) }, [reveal])
  useEffect(() => () => audio.current?.pause(), [])
  return html`<div class="play2">
    <div class="pmain">
      <${Head} title=${`Song ${v.round + 1} of ${v.rounds}`} sub=${reveal ? '' : v.long ? 'Five-second clip unlocked · worth 5' : 'Two seconds · worth 10'} until=${v.until} />
      <audio ref=${audio} preload="auto" onError=${() => setFailed(true)}></audio>
      <div class="mg-player">
        <button class="mg-play" onClick=${() => play(reveal ? 10 : v.clip)} aria-label="Play the clip"><svg viewBox="0 0 24 24" aria-hidden="true" class="ico fillico"><path d="M7 4.5v15l13-7.5z" /></svg></button>
        <div><b>${reveal ? 'Listen again' : `Play ${v.clip} seconds`}</b>
          <div class="dim small">${failed ? 'This clip did not load. Pick your best guess; the round still counts.' : blocked ? 'Tap play to hear it.' : 'Same moment for everyone.'}</div></div>
      </div>
      <div class="choices">${v.choices.map((c, i) => {
        let cls = 'choice'
        if (v.mine === i) cls += ' mine'
        if (reveal && i === v.right) cls += ' right'
        else if (reveal && v.mine === i) cls += ' wrong'
        const who = reveal ? Object.keys(v.picks).filter(id => v.picks[id] === i) : []
        return html`<button key=${i} class=${cls} disabled=${!seated || reveal || v.mine !== null} onClick=${() => act({ a: 'pick', i })}>
          <span class="grow"><b>${c.t}</b><div class="dim small">${c.f}</div></span>
          ${who.length ? html`<span class="who-picked">${who.map(id => html`<${Name} key=${id} id=${id} you=${false} />`)}</span>` : ''}</button>`
      })}</div>
      ${reveal && v.song ? html`<div class="answer-reveal"><div class="big-num">${v.song.t}</div><div class="dim">${v.song.f} (${v.song.y}) · ${v.song.artist}</div>
        <a class="small" href=${v.song.link} target="_blank" rel="noopener">Listen on Apple Music</a></div>` : ''}
      ${!reveal ? html`<${Waiting} ids=${inst.players} done=${v.answered} />` : ''}
    </div>
    <aside class="pside"><${Scores} pts=${v.pts} gained=${reveal ? v.gained : null} />
      <p class="dim small">Song clips are Apple Music previews.</p></aside>
  </div>`
}

/** One line on how the last round ended, for the top of the next one, and whether it went your way (a buzz on phones). */
export const recap = v => v.song ? { text: `It was ${v.song.t}${v.song.f ? ` (${v.song.f})` : ''}`, pts: v.gained?.[ME] ?? 0, good: (v.gained?.[ME] ?? 0) > 0 } : null
