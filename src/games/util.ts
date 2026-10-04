import type { Ctx } from '../engine'

/** Seated players with a live connection. Rounds end early once all of them have answered. */
export const active = (g: Ctx<any>) => g.players.filter(id => g.online.has(id))

export function allIn(g: Ctx<any>, done: Record<string, unknown>) {
  const a = active(g)
  return a.length > 0 && a.every(id => done[id] !== undefined)
}

/** Points for finishing a round 1st, 2nd, 3rd… */
export const PLACE = [10, 7, 5, 4, 3, 2, 1]

/** Edit distance, for "close" guesses. */
export function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

/** Folds plurals and articles so "Apples" and "an apple" match. */
export function singular(text: string) {
  return text.split(' ').filter(w => !['a', 'an', 'the'].includes(w)).map(w => {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
    if (w.length > 4 && /(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2)
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1)
    return w
  }).join(' ')
}

/** Strokes are sent as flat [x, y, x, y, …] lists on a 1000 × 750 canvas. */
export interface Stroke { id: number; c: number; w: number; p: number[] }
export const PEN_SIZES = [3, 6, 12, 24, 48]
export const INK = 16 // colours in the palette
export const MAX_POINTS = 24_000

/** Applies one drawing message to a list of strokes. Returns the event to pass on, or null if it was not valid. */
export function drawMsg(strokes: Stroke[], m: Record<string, unknown>): Record<string, unknown> | null {
  if (m.a === 'line') {
    const id = Number(m.id), c = Number(m.c), w = Number(m.w)
    const p = Array.isArray(m.p) ? m.p.slice(0, 400).map(n => Math.round(Number(n))) : []
    if (!Number.isInteger(id) || !(c >= 0 && c < INK) || !PEN_SIZES.includes(w) || p.length < 2 || p.length % 2 || p.some(n => !(n >= -20 && n <= 1020))) return null
    if (strokes.reduce((a, s) => a + s.p.length, 0) + p.length > MAX_POINTS) return null
    const last = strokes[strokes.length - 1]
    if (last && last.id === id) last.p.push(...p)
    else strokes.push({ id, c, w, p })
    return { k: 'line', id, c, w, p }
  }
  if (m.a === 'undo') { if (!strokes.length) return null; strokes.pop(); return { k: 'undo' } }
  if (m.a === 'clear') { strokes.length = 0; return { k: 'clear' } }
  return null
}
