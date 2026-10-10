// Game Night's own reaction stickers: drawn here, not emoji, so they look the same on every phone and fit the site.
// Each is a 64 × 64 drawing with a dark outline; the room sends only the sticker's name.
import { html } from './preact.js'

const INK = '#15161a'
const line = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`
const spark = (x, y, r, c) => `<path d="M${x} ${y - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}z" fill="${c}"/>`

export const STICKERS = [
  {
    k: 'wah', label: 'Wah!',
    svg: `<path d="M10 12h44a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H31L17 57l3-11h-10a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z" fill="#ffc83d" ${line}/>
      <text x="32" y="36" text-anchor="middle" font-family="Unbounded, system-ui, sans-serif" font-weight="800" font-size="15" fill="${INK}" transform="rotate(-6 32 32)">WAH!</text>
      ${spark(56, 8, 6, '#ff6b6b')}${spark(6, 52, 4, '#4dabf7')}`,
  },
  {
    k: 'haha', label: 'Haha',
    svg: `<circle cx="32" cy="33" r="24" fill="#ffd43b" ${line}/>
      <path d="M19 27q4.5-6 9 0M36 27q4.5-6 9 0" fill="none" ${line}/>
      <path d="M17 36h30a15 15 0 0 1-30 0z" fill="${INK}" ${line}/>
      <path d="M25 45.5a7 4.5 0 0 1 14 0 15 15 0 0 1-14 0z" fill="#ff6b6b"/>
      <path d="M9 27q-5 7 0 10q5-3 0-10zM55 27q-5 7 0 10q5-3 0-10z" fill="#74c0fc" stroke="${INK}" stroke-width="2"/>`,
  },
  {
    k: 'fire', label: 'On fire',
    svg: `<path d="M32 4c5 11 17 17 17 32a17 17 0 0 1-34 0c0-8 4-12 8-15 0 6 2 9 6 10-1-10 0-18 3-27z" fill="#ff6b2c" ${line}/>
      <path d="M32 31c3 5 9 7 9 14a9 9 0 0 1-18 0c0-4 2-6 4-8 1 3 2 4 4 5 0-4 0-7 1-11z" fill="#ffd43b" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      ${spark(53, 12, 5, '#ffc83d')}`,
  },
  {
    k: 'arre', label: 'Arre!',
    svg: `<circle cx="32" cy="35" r="23" fill="#b197fc" ${line}/>
      <path d="M17 21l9-4M47 21l-9-4" fill="none" ${line}/>
      <circle cx="24" cy="30" r="6" fill="#fff" ${line}/><circle cx="40" cy="30" r="6" fill="#fff" ${line}/>
      <circle cx="24.5" cy="31" r="2.4" fill="${INK}"/><circle cx="40.5" cy="31" r="2.4" fill="${INK}"/>
      <ellipse cx="32" cy="46" rx="5.5" ry="7" fill="${INK}"/>
      <path d="M8 6v8M14 4v10" fill="none" stroke="#ff6b6b" stroke-width="3.4" stroke-linecap="round"/><circle cx="8" cy="19" r="1.9" fill="#ff6b6b"/><circle cx="14" cy="19" r="1.9" fill="#ff6b6b"/>`,
  },
  {
    k: 'oof', label: 'Oof',
    svg: `<circle cx="31" cy="35" r="23" fill="#69db7c" ${line}/>
      <path d="M18 27l7 4-7 4M44 27l-7 4 7 4" fill="none" ${line}/>
      <path d="M19 46q3-4 6 0t6 0t6 0t6 0" fill="none" ${line}/>
      <path d="M52 5q-7 10 0 14q7-4 0-14z" fill="#74c0fc" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  },
  {
    k: 'legend', label: 'Legend',
    svg: `<path d="M8 44L13 17l11 12 8-17 8 17 11-12 5 27z" fill="#ffc83d" ${line}/>
      <rect x="8" y="44" width="48" height="10" rx="3" fill="#f59f00" ${line}/>
      <circle cx="13" cy="15" r="3.4" fill="#ff6b6b" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="10" r="3.6" fill="#4dabf7" stroke="${INK}" stroke-width="2"/><circle cx="51" cy="15" r="3.4" fill="#69db7c" stroke="${INK}" stroke-width="2"/>
      <circle cx="32" cy="36" r="4" fill="#fff" stroke="${INK}" stroke-width="2"/>
      ${spark(4, 30, 4, '#ffc83d')}${spark(60, 32, 4, '#ffc83d')}`,
  },
  {
    k: 'chai', label: 'Chai break',
    svg: `<path d="M24 14q-4-5 0-9M32 14q-4-5 0-9M40 14q-4-5 0-9" fill="none" stroke="#adb5bd" stroke-width="3" stroke-linecap="round"/>
      <path d="M14 20h36l-5 36a4 4 0 0 1-4 3.5H23a4 4 0 0 1-4-3.5z" fill="#e9ecef" ${line}/>
      <path d="M16.2 32h31.6l-3.2 23.5a2.5 2.5 0 0 1-2.5 2H21.9a2.5 2.5 0 0 1-2.5-2z" fill="#c8823b"/>
      <path d="M16 32h32" fill="none" stroke="${INK}" stroke-width="2"/>
      <path d="M22 24v6M29 24v6M36 24v6M43 24v6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
  },
]
export const STICKER = Object.fromEntries(STICKERS.map(s => [s.k, s]))

/** One sticker as an image. */
export function Sticker({ k, size = 40 }) {
  const s = STICKER[k]
  if (!s) return null
  return html`<svg class="sticker" viewBox="0 0 64 64" width=${size} height=${size} role="img" aria-label=${s.label} dangerouslySetInnerHTML=${{ __html: s.svg }}></svg>`
}
