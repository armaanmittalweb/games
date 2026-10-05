// Anonymous counts for the Switchboard (src/analytics.ts): page views, taps on share, script errors.
// Two random ids, nothing else: this browser (localStorage) and this visit (sessionStorage, new after 30 idle minutes).
// Opening the site once with /?me=1 marks this browser as the maker's own, and it is left out of every number.

const get = (s, k) => { try { return s.getItem(k) } catch { return null } }
const put = (s, k, v) => { try { s.setItem(k, v) } catch { /* private mode */ } }
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')

let vid = get(localStorage, 'gn.vid')
if (!vid) { vid = rand(8); put(localStorage, 'gn.vid', vid) }
export const VID = vid

if (new URLSearchParams(location.search).get('me') === '1') put(localStorage, 'gn.me', '1')
const mine = get(localStorage, 'gn.me') === '1' || navigator.webdriver === true

/** This visit's id. A visit ends after 30 minutes without a page view or a move. */
export function session() {
  const now = Date.now()
  let sid = get(sessionStorage, 'gn.sid')
  if (!sid || now - (Number(get(sessionStorage, 'gn.sidAt')) || 0) > 30 * 60_000) sid = rand(8)
  put(sessionStorage, 'gn.sid', sid)
  put(sessionStorage, 'gn.sidAt', String(now))
  return sid
}

export function track(t, extra = {}) {
  try {
    const body = JSON.stringify({ t, vid, sid: session(), x: mine, ...extra })
    if (navigator.sendBeacon) navigator.sendBeacon('/api/ev', body)
    else fetch('/api/ev', { method: 'POST', body, keepalive: true }).catch(() => {})
  } catch { /* counting never breaks the page */ }
}

let seen = ''
/** One view per path; the first carries where the visitor came from. */
export function pageView(path = location.pathname) {
  if (path === seen) return
  track('view', { path, ref: seen ? '' : document.referrer, utm: seen ? '' : new URLSearchParams(location.search).get('utm_source') ?? '' })
  seen = path
}

let errs = 0
const onErr = msg => { if (errs++ < 5) track('err', { msg: String(msg ?? 'unknown').slice(0, 120) }) }
addEventListener('error', e => onErr(e.message))
addEventListener('unhandledrejection', e => onErr(e.reason?.message ?? e.reason))
