// Game nights: a run of games picked for the room's size, time and mood, with one leaderboard across them.
import { CATALOG, META, estMinutes, type Meta, type Mood } from './catalog'

export type Length = 'quick' | 'standard' | 'chaos' | 'tournament' | 'endless'
export const LENGTHS: Record<Length, { label: string; minutes: number }> = {
  quick: { label: 'Quick', minutes: 15 },
  standard: { label: 'Standard', minutes: 30 },
  chaos: { label: 'Chaos', minutes: 45 },
  tournament: { label: 'Tournament', minutes: 60 },
  endless: { label: 'Endless', minutes: 0 },
}
export const MOODS: Mood[] = ['think', 'chaos', 'competitive', 'deception', 'creative', 'fast', 'social', 'strategic']

export interface Night {
  length: Length
  moods: Mood[]
  plan: string[]
  /** The game being played or just played; -1 before the first. */
  idx: number
  /** Tournament: who is still in. Everyone else watches. */
  alive: string[]
  points: Record<string, number>
  rounds: { id: string; points: Record<string, number>; out: string[] }[]
  done: boolean
  champions: string[]
}

/** Points a place is worth on the night's (and the room's) leaderboard. */
export const placePoints = (place: number) => [10, 7, 5, 4, 3, 2, 1][place - 1] ?? 1

/** How many are left after each tournament cut, down to the two who play the final. */
export function cuts(n: number) {
  const seq = [n]
  while (seq[seq.length - 1] > 2) seq.push(Math.max(2, Math.ceil((seq[seq.length - 1] * 2) / 3)))
  if (seq.length === 1) seq.push(2) // two players: one heat, then the final
  return seq
}

const FINALS = ['reaction', 'stopwatch', 'trivia', 'wordle', 'liarsdice', 'closest', 'wordgrid', 'lastcard']

function score(m: Meta, moods: Mood[], length: Length, r: () => number) {
  let s = r() * 3
  for (const mood of moods) {
    if (m.moods.includes(mood)) s += 4
    if (mood === 'think') s += m.dna.brain - 3
    if (mood === 'chaos') s += m.dna.chaos - 3
    if (mood === 'competitive') s += m.dna.skill - 3
    if (mood === 'social') s += m.dna.social - 3
  }
  if (length === 'chaos') s += m.dna.chaos - 2
  return s
}

/** Picks games for a night. Never the same category twice in a row when it can help it. */
export function plan(players: number, length: Length, moods: Mood[], r: () => number, avoid: string[] = []): string[] {
  if (length === 'tournament') {
    const seq = cuts(players)
    const out: string[] = []
    seq.forEach((n, i) => {
      const last = i === seq.length - 1
      const pool = CATALOG.filter(m => n >= m.min && n <= m.max && !m.teams && !out.includes(m.id) && (!last || FINALS.includes(m.id)))
        .map(m => ({ m, s: score(m, moods, length, r) + (last ? m.dna.skill : 0) })).sort((a, b) => b.s - a.s)
      const prev = out.length ? META[out[out.length - 1]].cat : ''
      const pick = pool.find(x => x.m.cat !== prev) ?? pool[0]
      if (pick) out.push(pick.m.id)
    })
    return out
  }
  const budget = length === 'endless' ? 25 : LENGTHS[length].minutes
  const pool = CATALOG.filter(m => players >= m.min && players <= m.max && !avoid.includes(m.id))
    .map(m => ({ m, s: score(m, moods, length, r) })).sort((a, b) => b.s - a.s)
  const chosen: Meta[] = []
  let used = 0
  for (const { m } of pool) {
    const t = estMinutes(m, players)
    // No single game takes most of the night, and the night does not run far over.
    if (t > budget * 0.6 || (used + t > budget + 4 && chosen.length)) continue
    chosen.push(m)
    used += t
    if (used >= budget) break
  }
  if (!chosen.length && pool.length) chosen.push(pool[0].m)
  // Spread categories out: repeatedly take the best-scored game whose category differs from the last one.
  const out: Meta[] = []
  while (chosen.length) {
    const prev = out.length ? out[out.length - 1].cat : ''
    const i = Math.max(0, chosen.findIndex(m => m.cat !== prev))
    out.push(chosen.splice(i, 1)[0])
  }
  return out.map(m => m.id)
}

/** A different game for one slot of a plan. */
export function swap(night: Night, i: number, players: number, r: () => number): string | null {
  const used = new Set(night.plan)
  const n = night.length === 'tournament' ? cuts(players)[i] ?? 2 : players
  const last = night.length === 'tournament' && i === night.plan.length - 1
  const pool = CATALOG.filter(m => !used.has(m.id) && n >= m.min && n <= m.max && (night.length !== 'tournament' || !m.teams) && (!last || FINALS.includes(m.id)))
  if (!pool.length) return null
  pool.sort((a, b) => score(b, night.moods, night.length, r) - score(a, night.moods, night.length, r))
  return pool[Math.floor(r() * Math.min(3, pool.length))].id
}
