// Room points: what one game is worth on the room's leaderboard and on the game night's table.
//
// Only players who took part are ranked: a player who made no move scores 0 and does not count. Among the n who took
// part, a place is worth 10 × the share of the others you finished ahead of, capped by the ladder 10, 7, 5, 4, 3, 2, 1
// so that a win stays well clear of second:
//   2 players  10 0
//   3          10 5 0
//   4          10 7 3 0
//   5          10 7 5 3 0
//   6          10 7 5 4 2 0
//   8          10 7 5 4 3 2 1 0
//   more       10 7 5 4 3 2 1 1 … 1 0
// Last place scores 0; anyone who beat somebody scores at least 1. Players level on a place share the points of the
// places they cover (two level for 1st of 4 get (10 + 7) / 2, rounded up: 9 each). In a team game the teams are
// ranked instead of the players, so every winner gets 10. A game played alone gives no points.
import type { Standing } from './engine'

const LADDER = [10, 7, 5, 4, 3, 2, 1]

/** Points for position k (1 = first) of n, before ties are shared. */
export function worth(k: number, n: number) {
  if (n < 2 || k >= n) return 0
  return Math.max(1, Math.round(Math.min(LADDER[k - 1] ?? 1, (10 * (n - k)) / (n - 1))))
}

export interface Award {
  /** Points for every player in the standings (0 for anyone who did not take part). */
  pts: Record<string, number>
  /** Who won: the first place among those who took part, when they finished ahead of somebody. */
  winners: string[]
  /** Players in the standings who made no move. */
  sat: string[]
}

export function award(standings: Standing[], took: (id: string) => boolean, teams = false): Award {
  const pts: Record<string, number> = Object.fromEntries(standings.map(s => [s.id, 0]))
  const ranked = standings.filter(s => took(s.id)).sort((a, b) => a.place - b.place)
  const groups: Standing[][] = []
  for (const s of ranked) {
    const last = groups[groups.length - 1]
    if (last && last[0].place === s.place) last.push(s)
    else groups.push([s])
  }
  // Teams count as one entrant each; otherwise a group of level players covers one position per player.
  const n = teams ? groups.length : ranked.length
  let at = 1
  for (const grp of groups) {
    const span = teams ? 1 : grp.length
    let sum = 0
    for (let k = at; k < at + span; k++) sum += worth(k, n)
    for (const s of grp) pts[s.id] = Math.round(sum / span)
    at += span
  }
  const winners = groups.length > 1 ? groups[0].map(s => s.id) : []
  return { pts, winners, sat: standings.filter(s => !took(s.id)).map(s => s.id) }
}
