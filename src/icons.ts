// One icon per game: a coloured tile with a white drawing on a 48 x 48 grid. scripts/build-site.mjs puts the finished
// SVG into public/catalog.js (for the page) and into the guide pages.

const W = '#fff'
const line = (d: string, extra = '') => `<path d="${d}" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const fill = (d: string, color = W) => `<path d="${d}" fill="${color}"/>`
const dot = (x: number, y: number, r: number, color = W) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`
const ring = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${W}" stroke-width="3"/>`
const box = (x: number, y: number, s: number, f: string | null, rx = 2) =>
  f ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}" fill="${f}"/>` : `<rect x="${x + 1}" y="${y + 1}" width="${s - 2}" height="${s - 2}" rx="${rx}" fill="none" stroke="${W}" stroke-width="2.2" opacity=".75"/>`

const ICONS: Record<string, { color: string; draw: (c: string) => string }> = {
  // A pencil drawing a squiggle.
  draw: { color: '#e8590c', draw: () => fill('M29.5 10.5l8 8L21 35l-9.5 1.5L13 27z') + line('M26 14l8 8', ' stroke="#e8590c" stroke-width="2.5"') + line('M22 39.5c3-2.5 5.5-2.5 8 0s5 2.5 8 0', ' stroke-width="2.6"') },
  // An eye mask: one of you is hiding something.
  imposter: { color: '#c92a2a', draw: c => fill('M8 19c5-4 11-4 16-1 5-3 11-3 16 1 0 9-4 13-9 13-3.5 0-4.5-3.5-7-3.5s-3.5 3.5-7 3.5c-5 0-9-4-9-13z') + `<ellipse cx="16.5" cy="23" rx="3.4" ry="2.4" fill="${c}"/><ellipse cx="31.5" cy="23" rx="3.4" ry="2.4" fill="${c}"/>` },
  // A board of cards, some claimed by each team.
  codewords: { color: '#1971c2', draw: () => box(9, 9, 9, W) + box(19.5, 9, 9, null) + box(30, 9, 9, '#ff8787') + box(9, 19.5, 9, null) + box(19.5, 19.5, 9, W) + box(30, 19.5, 9, null) + box(9, 30, 9, '#ff8787') + box(19.5, 30, 9, null) + box(30, 30, 9, W) },
  // Two rows of letter tiles: one letter in the wrong place, then the word.
  wordle: { color: '#2b8a3e', draw: () => box(8, 12, 10, '#fcc419') + box(19, 12, 10, null) + box(30, 12, 10, null) + box(8, 26, 10, W) + box(19, 26, 10, W) + box(30, 26, 10, W) },
  // Two tin cans on a string.
  telephone: { color: '#0c8599', draw: () => fill('M7 15h9l-1.2 18H8.2z') + fill('M32 15h9l-1.2 18h-6.6z') + line('M15.5 20c4.5 9.5 12.5 9.5 17 0', ' stroke-width="2"') + line('M7 15h9M32 15h9', ' stroke="#0c8599" stroke-width="1.6"') },
  // An open dictionary.
  bluff: { color: '#6741d9', draw: () => line('M24 15c-4-3-9-3.5-14-2.5v21c5-1 10-.5 14 2.5 4-3 9-3.5 14-2.5v-21c-5-1-10-.5-14 2.5z') + line('M24 15v21') + line('M14 19.5c2-.4 4-.3 6 .4M14 25c2-.4 4-.3 6 .4', ' stroke-width="2" opacity=".7"') },
  // Two minds, meeting in the middle.
  mindmeld: { color: '#9c36b5', draw: () => ring(18.5, 24, 10) + ring(29.5, 24, 10) + fill('M24 15.7a10 10 0 0 1 0 16.6 10 10 0 0 1 0-16.6z') },
  // Three friends, and the one everyone points at.
  mostlikely: { color: '#c2255c', draw: () => dot(12, 23, 3.5) + line('M6.5 35c0-4.5 2.5-7 5.5-7s5.5 2.5 5.5 7') + dot(36, 23, 3.5) + line('M30.5 35c0-4.5 2.5-7 5.5-7s5.5 2.5 5.5 7') + dot(24, 19, 5) + fill('M15.5 37c0-6.5 3.5-10.5 8.5-10.5s8.5 4 8.5 10.5z') + line('M24 5.5v6M21 9l3 3 3-3', ` stroke-width="2.5"`) },
  // A question in a speech bubble.
  trivia: { color: '#3b5bdb', draw: () => line('M13 11h22a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H23l-7 6v-6h-3a4 4 0 0 1-4-4V15a4 4 0 0 1 4-4z') + line('M20.5 18a3.5 3.5 0 1 1 5.2 3c-1.1.6-1.7 1.4-1.7 2.6', ' stroke-width="2.8"') + dot(24, 27.5, 1.7) },
  // A grid of letters with a word traced through it.
  wordgrid: { color: '#5c940d', draw: () => [9, 19.5, 30].flatMap(y => [9, 19.5, 30].map(x => box(x, y, 9, null))).join('') + line('M13.5 13.5L24 24h10.5v10.5', ' stroke-width="3.5"') + dot(13.5, 13.5, 3) + dot(24, 24, 3) + dot(34.5, 24, 3) + dot(34.5, 34.5, 3) },
  // Two cards in a fan.
  lastcard: { color: '#e67700', draw: c => `<rect x="10.5" y="12" width="16" height="23" rx="3" fill="none" stroke="${W}" stroke-width="3" transform="rotate(-14 18.5 23.5)"/><rect x="21" y="12.5" width="16.5" height="23.5" rx="3" fill="${W}" transform="rotate(10 29 24)"/>` + fill('M29.3 19.5l4 4.8-4 4.8-4-4.8z', c) },
  // A die, showing five.
  liarsdice: { color: '#495057', draw: c => `<g transform="rotate(-10 24 24)"><rect x="11" y="11" width="26" height="26" rx="6" fill="${W}"/>${dot(18, 18, 2.4, c)}${dot(30, 18, 2.4, c)}${dot(24, 24, 2.4, c)}${dot(18, 30, 2.4, c)}${dot(30, 30, 2.4, c)}</g>` },
  // A lightning bolt.
  reaction: { color: '#f08c00', draw: () => fill('M27.5 7L13 27.5h9.5L20 41l15-21h-9.5z') },
  // A stopwatch.
  stopwatch: { color: '#1864ab', draw: () => ring(24, 27, 12) + line('M20 8.5h8M24 8.5V15M35 15.5l2.5-2.5') + line('M24 27l5.5-5.5') + dot(24, 27, 2.2) },
  // A target with a dart near the middle.
  closest: { color: '#087f5b', draw: () => ring(22, 26, 12) + ring(22, 26, 6) + dot(22, 26, 2.2) + line('M24.5 23.5L37 11M33 9.5l4.5 1.5L39 15.5', ' stroke-width="2.6"') },
}

/** The finished SVG for a game, sized by CSS (1em by default). */
export function iconSvg(id: string): string {
  const i = ICONS[id]
  if (!i) return ''
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect width="48" height="48" rx="13" fill="${i.color}"/><path d="M0 13A13 13 0 0 1 13 0h22a13 13 0 0 1 13 13v8H0z" fill="#fff" opacity=".1"/>${i.draw(i.color)}</svg>`
}

export const ICON_IDS = Object.keys(ICONS)
