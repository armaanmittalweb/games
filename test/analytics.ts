// Checks the Switchboard numbers (src/analytics.ts) on a scenario spread over weeks, using a real SQLite database.
import { DatabaseSync } from 'node:sqlite'
import * as A from '../src/analytics'

/** Enough of Cloudflare's SqlStorage for the analytics code. */
function fakeSql() {
  const db = new DatabaseSync(':memory:')
  return {
    exec(q: string, ...b: unknown[]) {
      if (!b.length && q.split(';').filter(s => s.trim()).length > 1) { db.exec(q); return { toArray: () => [], one: () => ({}) } }
      const st = db.prepare(q)
      const rows = /^\s*(SELECT|WITH)/i.test(q) ? (st.all(...(b as never[])) as Record<string, unknown>[]) : (st.run(...(b as never[])), [])
      return { toArray: () => rows, one: () => rows[0] }
    },
  } as unknown as SqlStorage
}

export function checkAnalytics(): number {
  let failures = 0
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) { failures++; console.log(`FAIL analytics ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`) }
  }

  // Where people come from.
  eq('WhatsApp app', A.channel('android-app://com.whatsapp/', '').src, 'WhatsApp')
  eq('Facebook link shim', A.channel('https://l.facebook.com/', '').src, 'Facebook')
  eq('X', A.channel('https://t.co/abc', '').src, 'X')
  eq('utm wins', A.channel('https://www.google.com/', 'Newsletter').src, 'newsletter')
  eq('no referrer', A.channel('', '').src, 'Direct')
  eq('own pages', A.channel('https://games.amittal.dev/games', '').src, 'Direct')
  eq('portfolio', A.channel('https://www.amittal.dev/', '').src, 'amittal.dev')
  eq('Indian day boundary', A.dayOf(Date.parse('2026-09-01T23:59:00+05:30')), '2026-09-01')
  eq('Indian day boundary 2', A.dayOf(Date.parse('2026-09-02T00:01:00+05:30')), '2026-09-02')

  const sql = fakeSql()
  sql.exec(A.SCHEMA)
  const day0 = Date.parse('2026-09-01T19:00:00+05:30')
  const at = (d: number, hhmm: string) => Date.parse(`2026-09-01T${hhmm}:00+05:30`) + d * 86_400_000
  const view = (vid: string, d: number, ref = '', path = '/', x = false) => A.pageEvent(sql, { t: 'view', vid, sid: vid + 'sess' + d, path, ref, x }, at(d, '19:00'))
  const join = (rid: string, vid: string, d: number, first = false) => A.joined(sql, { rid, code: 'ABCDE', pid: 'p' + vid, vid, sid: vid + 'sess' + d, first }, at(d, '19:30'))

  // Asha comes from Google and plays; back on day 1 and day 7. Bilal arrives by a room link, back on day 3.
  // Chen plays once and never returns. Tester is a test browser: left out of everything.
  view('asha0001', 0, 'https://www.google.com/'); view('bilal001', 0, '', '/r/'); view('chen0001', 0, 'https://www.instagram.com/'); view('tester01', 0, '', '/', true)
  view('asha0001', 1); view('asha0001', 7); view('bilal001', 3); view('tester01', 1, '', '/', true)
  A.roomMade(sql, 'room0001', 'ABCDE', at(0, '19:29'))
  join('room0001', 'asha0001', 0, true); join('room0001', 'bilal001', 0); join('room0001', 'chen0001', 0)
  A.roomMade(sql, 'room0002', 'FGHJK', at(0, '19:40'))
  join('room0002', 'bilal001', 0, true); join('room0002', 'chen0001', 0)
  A.roomMade(sql, 'room0003', 'LMNPQ', at(0, '19:50'))
  join('room0003', 'tester01', 0, true)
  A.roomMade(sql, 'room0004', 'RSTUV', at(0, '19:55')) // made, nobody ever joined

  const game = (rid: string, gid: string, id: string, seq: number, players: number, from: string, to: string | null, outcome: 'done' | 'aborted' = 'done') => {
    A.gameChosen(sql, { rid, gid, game: id, seq, players, night: false }, at(0, from))
    if (to) A.gameEnded(sql, { gid, rid, outcome, began: at(0, from) + 30_000, players, readyAll: seq === 1, acts: 10, errs: 0, dropped: 0, rejoined: 0 }, at(0, to))
  }
  game('room0001', 'room0001:1', 'trivia', 1, 3, '20:00', '20:10')
  game('room0001', 'room0001:2', 'closest', 2, 3, '20:12', '20:20')
  game('room0001', 'room0001:3', 'draw', 3, 3, '20:22', null) // never finished
  game('room0002', 'room0002:1', 'trivia', 1, 2, '20:05', '20:30')
  game('room0003', 'room0003:1', 'trivia', 1, 1, '20:00', '20:05')
  A.feedback(sql, { vid: 'asha0001', rid: 'room0001', game: 'trivia', rating: 5, again: true }, at(0, '20:11'))
  A.feedback(sql, { vid: 'tester01', rid: 'room0003', game: 'trivia', rating: 1, again: false }, at(0, '20:06'))
  A.feedback(sql, { vid: 'chen0001', rid: 'room0001', game: 'trivia', kind: 'idea', text: 'Add chess!' }, at(0, '20:11'))
  A.feedback(sql, { vid: 'bilal001', rid: 'room0002', game: 'trivia', kind: 'idea', text: 'add chess' }, at(0, '20:31'))

  const r = A.report(sql, 0, at(40, '12:00'))
  eq('since', r.since, '2026-09-01')
  eq('new visitors', r.acquisition.newVisitors, 3)
  eq('sources', r.acquisition.sources.map(s => s.label).sort(), ['Google', 'Instagram', 'Room link'])
  eq('rooms created', r.activation.created, 2)
  eq('rooms started', r.activation.started, 2)
  eq('players per room', r.activation.avgPlayers, 2.5)
  eq('games', r.engagement.games, 4)
  eq('completed', r.engagement.completed, 0.75)
  eq('median games per night', r.engagement.medianGamesPerNight, 1.5)
  eq('median night', r.engagement.medianNightMin, 22.5)
  eq('2nd game', r.engagement.second, 0.5)
  eq('3rd game', r.engagement.third, 1)
  eq('peak players at once', r.engagement.peakPlayers, 5)
  eq('D1', [r.retention.d1.n, r.retention.d1.back], [3, 1])
  eq('D7', [r.retention.d7.back, r.retention.d7.within], [1, 2 / 3])
  eq('D14', [r.retention.d14.back, r.retention.d14.within], [0, 2 / 3])
  eq('D30', r.retention.d30.back, 0)
  eq('rooms by referred users', r.virality.roomsByReferred, 1)
  eq('new from invites', r.virality.newFromInvites, 1)
  eq('ratings (tester left out)', [r.feedback.ratings, r.feedback.avgRating, r.feedback.again], [1, 5, 1])
  eq('requested games grouped', r.feedback.ideas.map(i => i.n), [2])
  eq('funnel', r.funnel, { newVisitors: 3, played: 3, twoRooms: 2, returned: 2 })

  // A recent window: day 7 is "today"; only Asha is around.
  const w = A.report(sql, 7, at(7, '23:00'))
  eq('window DAU', w.acquisition.dau, 1)
  eq('window WAU', w.acquisition.wau, 2)
  eq('window new visitors', w.acquisition.newVisitors, 0)
  return failures
}
