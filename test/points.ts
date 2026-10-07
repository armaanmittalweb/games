// Checks room points (src/points.ts): the table by number of players, shared ties, team games and players who sat out.
import { award, worth } from '../src/points'
import type { Standing } from '../src/engine'

export function checkPoints(): number {
  let failures = 0
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) { failures++; console.log(`FAIL points ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`) }
  }
  const table = (n: number) => Array.from({ length: n }, (_, i) => worth(i + 1, n))
  eq('1 player', table(1), [0])
  eq('2 players', table(2), [10, 0])
  eq('3 players', table(3), [10, 5, 0])
  eq('4 players', table(4), [10, 7, 3, 0])
  eq('5 players', table(5), [10, 7, 5, 3, 0])
  eq('6 players', table(6), [10, 7, 5, 4, 2, 0])
  eq('8 players', table(8), [10, 7, 5, 4, 3, 2, 1, 0])
  eq('12 players', table(12), [10, 7, 5, 4, 3, 2, 1, 1, 1, 1, 1, 0])
  for (let n = 2; n <= 30; n++) {
    const t = table(n)
    if (t.some((x, i) => i > 0 && x > t[i - 1])) eq(`${n} players never rises`, t, 'falling')
    if (t.slice(0, -1).some(x => x < 1)) eq(`${n} players: everyone above last scores`, t, 'at least 1')
  }

  const st = (places: number[]): Standing[] => places.map((place, i) => ({ id: `p${i + 1}`, place, score: 0 }))
  const all = () => true
  eq('plain', award(st([1, 2, 3, 4]), all), { pts: { p1: 10, p2: 7, p3: 3, p4: 0 }, winners: ['p1'], sat: [] })
  eq('two level for 1st share 1st and 2nd', award(st([1, 1, 3, 4]), all).pts, { p1: 9, p2: 9, p3: 3, p4: 0 })
  eq('a draw between two', award(st([1, 1]), all), { pts: { p1: 5, p2: 5 }, winners: [], sat: [] })
  eq('everyone level: nobody wins', award(st([1, 1, 1]), all).winners, [])
  eq('alone: no points, no win', award(st([1]), all), { pts: { p1: 0 }, winners: [], sat: [] })

  // Players who made no move score 0 and do not count: three who played are ranked as three.
  const idle = (ids: string[]) => (id: string) => !ids.includes(id)
  eq('sat out', award(st([1, 1, 3, 4]), idle(['p2'])), { pts: { p1: 10, p2: 0, p3: 5, p4: 0 }, winners: ['p1'], sat: ['p2'] })
  eq('nobody played', award(st([1, 1, 1, 1]), () => false), { pts: { p1: 0, p2: 0, p3: 0, p4: 0 }, winners: [], sat: ['p1', 'p2', 'p3', 'p4'] })
  // A sit-out ranked above the players (an idle bidder keeps their coins) does not push the winner down.
  eq('sit-out on top', award(st([1, 2, 3]), idle(['p1'])).pts, { p1: 0, p2: 10, p3: 0 })

  // Team games rank the teams: every winner gets 10, every loser 0, at any team size.
  eq('teams 2 v 2', award(st([1, 1, 2, 2]), all, true).pts, { p1: 10, p2: 10, p3: 0, p4: 0 })
  eq('teams 4 v 3', award(st([1, 1, 1, 1, 2, 2, 2]), all, true).winners, ['p1', 'p2', 'p3', 'p4'])
  return failures
}
