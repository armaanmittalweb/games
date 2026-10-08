// One icon per game: a drawing on a 48 x 48 grid, on a tile in the colour of its kind of game (every word game is
// blue, every drawing game red, and so on). scripts/build-site.mjs puts the finished SVG into public/catalog.js (for
// the page) and into the guide pages. No imports here, so Node can read this file directly.

/** The colour of each kind of game, and the colour drawn on it. */
export const KINDS: Record<string, { bg: string; ink: string }> = {
  Word: { bg: '#3355ff', ink: '#ffffff' }, Drawing: { bg: '#ff5a3c', ink: '#15161a' }, Party: { bg: '#ffc83d', ink: '#15161a' },
  Deception: { bg: '#7c3aed', ink: '#ffffff' }, Trivia: { bg: '#4db6ff', ink: '#15161a' }, Puzzle: { bg: '#a8e05f', ink: '#15161a' },
  Strategy: { bg: '#2ed3a0', ink: '#15161a' }, Cards: { bg: '#ff8fc7', ink: '#15161a' }, Reflex: { bg: '#ff9f1c', ink: '#15161a' },
}
const GOLD = '#ffc83d', RED = '#ff5a3c', DARK = '#15161a'

/** A stroked path. `extra` attributes replace the defaults of the same name (an attribute twice makes the SVG invalid
 * as an image file, which the result card draws from). */
function line(d: string, ink: string, extra = '') {
  const set = new Map(Object.entries({ fill: 'none', stroke: ink, 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
  for (const [, k, v] of extra.matchAll(/([a-z-]+)="([^"]*)"/g)) set.set(k, v)
  return `<path d="${d}"${[...set].map(([k, v]) => ` ${k}="${v}"`).join('')}/>`
}
const fill = (d: string, color: string) => `<path d="${d}" fill="${color}"/>`
const dot = (x: number, y: number, r: number, color: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`
const ring = (x: number, y: number, r: number, ink: string, w = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${ink}" stroke-width="${w}"/>`
const rect = (x: number, y: number, w: number, h: number, rx: number, color: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}"/>`
const hollow = (x: number, y: number, s: number, ink: string, rx = 2, w = 2.2, o = '.7') => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}" fill="none" stroke="${ink}" stroke-width="${w}" opacity="${o}"/>`
const text = (x: number, y: number, size: number, color: string, t: string, weight = 700) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="Unbounded, ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${t}</text>`

const ART: Record<string, (ink: string, bg: string) => string> = {
  // A board of cards, some claimed by each team.
  codewords: ink => rect(9, 9, 9, 9, 2, ink) + hollow(20.5, 10, 7, ink) + rect(30, 9, 9, 9, 2, RED) + hollow(10, 20.5, 7, ink) + rect(19.5, 19.5, 9, 9, 2, ink)
    + hollow(31, 20.5, 7, ink) + rect(9, 30, 9, 9, 2, RED) + hollow(20.5, 31, 7, ink) + rect(30, 30, 9, 9, 2, ink),
  // PLAY, with one letter in the wrong place and one not in the word.
  wordle: ink => rect(3, 18, 9.5, 12, 2.5, ink) + rect(14, 18, 9.5, 12, 2.5, GOLD) + rect(25, 18, 9.5, 12, 2.5, ink) + `<rect x="36" y="18" width="9.5" height="12" rx="2.5" fill="${ink}" opacity=".3"/>`
    + text(7.75, 26.8, 7.5, DARK, 'P') + text(18.75, 26.8, 7.5, DARK, 'L') + text(29.75, 26.8, 7.5, DARK, 'A') + text(40.75, 26.8, 7.5, ink, 'Y'),
  // An open dictionary with a question in it.
  bluff: ink => line('M24 15c-4-3-9-3.5-14-2.5v21c5-1 10-.5 14 2.5 4-3 9-3.5 14-2.5v-21c-5-1-10-.5-14 2.5z', ink) + line('M24 15v21', ink)
    + line('M14 19.5c2-.4 4-.3 6 .4M14 25c2-.4 4-.3 6 .4', ink, ' stroke-width="2" opacity=".7"') + text(31, 29.5, 12, GOLD, '?', 800),
  // A grid of letters with a word traced through it.
  wordgrid: ink => [10, 20.5, 31].flatMap(y => [10, 20.5, 31].map(x => hollow(x, y, 7, ink, 2, 2, '.6'))).join('')
    + line('M13.5 13.5L24 24h10.5v10.5', GOLD, ' stroke-width="3.5"') + dot(13.5, 13.5, 3, GOLD) + dot(24, 24, 3, GOLD) + dot(34.5, 24, 3, GOLD) + dot(34.5, 34.5, 3, GOLD),
  // A scribble.
  draw: ink => line('M5 34c4-11 8-17 12-15s-3 13 2 14 7-15 12-14 2 12 6 12 6-5 7-9', ink, ' stroke-width="3.4"'),
  // Two tin cans on a string.
  telephone: ink => fill('M6 19.5l10-3v15l-10-3z', ink) + fill('M42 19.5l-10-3v15l10-3z', ink) + line('M16 24c5 7 11 7 16 0', ink, ' stroke-width="2.2"'),
  // Two minds overlapping.
  mindmeld: ink => dot(18, 24, 10.5, ink) + ring(30, 24, 10.5, ink, 3.2),
  // Three friends, and the one everyone points at.
  mostlikely: ink => dot(12, 23, 3.5, ink) + line('M6.5 35c0-4.5 2.5-7 5.5-7s5.5 2.5 5.5 7', ink) + dot(36, 23, 3.5, ink) + line('M30.5 35c0-4.5 2.5-7 5.5-7s5.5 2.5 5.5 7', ink)
    + dot(24, 19, 5, ink) + fill('M15.5 37c0-6.5 3.5-10.5 8.5-10.5s8.5 4 8.5 10.5z', ink) + line('M24 5.5v6M21 9l3 3 3-3', ink, ' stroke-width="2.5"'),
  // An eye mask: one of you is hiding something.
  imposter: (ink, bg) => fill('M8 19c5-4 11-4 16-1 5-3 11-3 16 1 0 9-4 13-9 13-3.5 0-4.5-3.5-7-3.5s-3.5 3.5-7 3.5c-5 0-9-4-9-13z', ink)
    + `<ellipse cx="16.5" cy="23" rx="3.4" ry="2.4" fill="${bg}"/><ellipse cx="31.5" cy="23" rx="3.4" ry="2.4" fill="${bg}"/>`,
  // A question in a speech bubble.
  trivia: ink => line('M13 11h22a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H23l-7 6v-6h-3a4 4 0 0 1-4-4V15a4 4 0 0 1 4-4z', ink)
    + line('M20.5 18a3.5 3.5 0 1 1 5.2 3c-1.1.6-1.7 1.4-1.7 2.6', ink, ' stroke-width="2.8"') + dot(24, 27.5, 1.7, ink),
  // A target with a dart near the middle.
  closest: ink => ring(22, 26, 12, ink) + ring(22, 26, 6, ink) + dot(22, 26, 2.2, ink) + line('M24.5 23.5L37 11M33 9.5l4.5 1.5L39 15.5', ink, ' stroke-width="2.6"'),
  // A globe with a pin in it.
  geoguess: (ink, bg) => ring(21, 27, 12, ink) + line('M9 27h24M21 15c-5 6-5 18 0 24M21 15c5 6 5 18 0 24', ink, ' stroke-width="2"')
    + fill('M34 6a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7z', ink) + dot(34, 13, 2.6, bg),
  // A music note with sound coming out.
  musicguess: ink => fill('M19 12l14-4v20.5a5 5 0 1 1-3-4.6V14.3l-8 2.3v14.9a5 5 0 1 1-3-4.6z', ink) + line('M38 18c2 2 2 6 0 8M41.5 15c3.5 4 3.5 10 0 14', ink, ' stroke-width="2.2"'),
  // A clapperboard.
  movieguess: (ink, bg) => fill('M9 22h30v15a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z', ink)
    + `<g transform="rotate(-12 9 20)">${fill('M9 13h30v7H9z', ink)}${fill('M14 13l4 7h3l-4-7zM24 13l4 7h3l-4-7zM34 13l4 7h1v-1l-3.4-6z', bg)}</g>` + line('M15 28h18M15 33h12', bg, ' stroke-width="2.2"'),
  // Sixteen tiles; one row already grouped.
  connections: ink => [0, 1, 2, 3].map(k => rect(8 + k * 8.4, 9, 7, 7, 1.6, ink)).join('')
    + [1, 2, 3].flatMap(r => [0, 1, 2, 3].map(k => hollow(9 + k * 8.4, 9.4 + r * 8.4, 5, ink, 1.4, 2, '.55'))).join(''),
  // A row of coloured pegs, and the score pegs beside it.
  mastermind: ink => dot(10.5, 13, 3, ink) + dot(21, 13, 3, ink) + dot(31.5, 13, 3, ink)
    + `<circle cx="10.5" cy="24" r="4.6" fill="${RED}" stroke="${ink}" stroke-width="1.6"/><circle cx="21" cy="24" r="4.6" fill="#3355ff" stroke="${ink}" stroke-width="1.6"/><circle cx="31.5" cy="24" r="4.6" fill="#ffffff" stroke="${ink}" stroke-width="1.6"/>`
    + ring(10.5, 35, 3, ink, 2.4) + ring(21, 35, 3, ink, 2.4) + dot(39.5, 21, 1.8, ink) + dot(39.5, 27, 1.8, ink) + ring(39.5, 33, 1.6, ink, 1.4),
  // The number to make.
  make24: ink => text(24, 31, 20, ink, '24', 800) + line('M10 38.5h28', ink, ' stroke-width="2.4" opacity=".6"'),
  // A flag planted on claimed ground.
  territory: ink => rect(8, 28, 10, 10, 2, ink) + rect(19, 28, 10, 10, 2, ink) + hollow(31, 29, 8, ink) + hollow(20, 18, 8, ink) + line('M24 24V7', ink) + fill('M25 7.5l11 4-11 4z', ink),
  // An auction hammer.
  auction: ink => `<g transform="rotate(-40 24 24)">${fill('M14 10h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', ink)}${fill('M20.5 20h3v19h-3z', ink)}</g>`
    + line('M26 40h14', ink, ' stroke-width="3.5"'),
  // Two cards in a fan.
  lastcard: (ink, bg) => `<rect x="10.5" y="12" width="16" height="23" rx="3" fill="none" stroke="${ink}" stroke-width="3" transform="rotate(-14 18.5 23.5)"/><rect x="21" y="12.5" width="16.5" height="23.5" rx="3" fill="${ink}" transform="rotate(10 29 24)"/>`
    + fill('M29.3 19.5l4 4.8-4 4.8-4-4.8z', bg),
  // A lightning bolt.
  reaction: ink => fill('M27.5 7L13 27.5h9.5L20 41l15-21h-9.5z', ink),
  // A stopwatch.
  stopwatch: ink => ring(24, 27, 12, ink) + line('M20 8.5h8M24 8.5V15M35 15.5l2.5-2.5', ink) + line('M24 27l5.5-5.5', ink) + dot(24, 27, 2.2, ink),
}

/** The finished SVG for a game (`kind` is its catalog category): the drawing on its kind's tile, sized by CSS. */
export function iconSvg(id: string, kind: string): string {
  const art = ART[id]
  if (!art) return ''
  const k = KINDS[kind] ?? KINDS.Word
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect width="48" height="48" rx="13.5" fill="${k.bg}"/><g transform="translate(3.84 3.84) scale(.84)">${art(k.ink, k.bg)}</g></svg>`
}

export const ICON_IDS = Object.keys(ART)
