import type { Stats } from './stats'
import type { PageEvent } from './analytics'

export { Room } from './room'
export { Stats } from './stats'

interface Env {
  ROOMS: DurableObjectNamespace
  STATS: DurableObjectNamespace<Stats>
  ASSETS: Fetcher
  /** Shared with the Switchboard, which reads /internal/stats through a service binding. */
  INTERNAL_KEY?: string
  /** Caps /api/ev per address, so a script cannot flood the counts. */
  EV_LIMIT?: RateLimit
  /** New rooms per browser on an address, and per address. Mobile networks in India put many people behind one
   *  address, so the address alone gets a far higher cap. */
  ROOM_LIMIT?: RateLimit
  ROOM_IP_LIMIT?: RateLimit
}

/** Compares two strings in time that does not depend on where they differ. */
function sameKey(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// No 0/O, 1/I/L: codes get read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function code() {
  const r = new Uint32Array(5)
  crypto.getRandomValues(r)
  return Array.from(r, n => ALPHABET[n % ALPHABET.length]).join('')
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const ip = req.headers.get('cf-connecting-ip') ?? ''
      const vid = (req.headers.get('x-vid') ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 40)
      const busy = json({ error: 'Too many rooms made from here. Try again in a minute.' }, 429)
      if (env.ROOM_LIMIT && !(await env.ROOM_LIMIT.limit({ key: `${ip} ${vid}` })).success) return busy
      if (env.ROOM_IP_LIMIT && !(await env.ROOM_IP_LIMIT.limit({ key: ip })).success) return busy
      for (let i = 0; i < 6; i++) {
        const c = code()
        const res = await env.ROOMS.get(env.ROOMS.idFromName(c)).fetch(`https://room/init?code=${c}`)
        if (res.ok) return json({ code: c })
      }
      return json({ error: 'Could not make a room, try again' }, 503)
    }
    // Whether a room is open, so an invite link to a closed one says so before asking for a name.
    const ex = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{5})$/)
    if (ex && req.method === 'GET') {
      const res = await env.ROOMS.get(env.ROOMS.idFromName(ex[1].toUpperCase())).fetch('https://room/exists')
      return json({ open: res.ok }, res.ok ? 200 : 404)
    }
    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{5})\/ws$/)
    if (m) {
      const c = m[1].toUpperCase()
      return env.ROOMS.get(env.ROOMS.idFromName(c)).fetch(new Request(`https://room/ws`, req))
    }
    // The page's own events for the Switchboard: page views, share taps, script errors (see src/analytics.ts).
    if (url.pathname === '/api/ev' && req.method === 'POST') {
      const ip = req.headers.get('cf-connecting-ip') ?? ''
      if (env.EV_LIMIT && !(await env.EV_LIMIT.limit({ key: ip })).success) return new Response(null, { status: 204 })
      const text = await req.text()
      if (text.length > 2000) return new Response(null, { status: 413 })
      let e: PageEvent
      try { e = JSON.parse(text) } catch { return new Response(null, { status: 400 }) }
      if (!e || typeof e !== 'object' || !['view', 'share', 'err'].includes(e.t)) return new Response(null, { status: 400 })
      const ua = req.headers.get('user-agent') ?? ''
      // Crawlers run scripts too; they are not visitors.
      if (/bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(ua)) e.x = true
      e.country = String((req as { cf?: { country?: string } }).cf?.country ?? '')
      e.device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop'
      await env.STATS.get(env.STATS.idFromName('global')).event(e)
      return new Response(null, { status: 204 })
    }
    // The contact page: a problem report or a message, kept with the feedback the Switchboard shows.
    if (url.pathname === '/api/report' && req.method === 'POST') {
      const ip = req.headers.get('cf-connecting-ip') ?? ''
      if (env.EV_LIMIT && !(await env.EV_LIMIT.limit({ key: `report ${ip}` })).success) return json({ error: 'Too many messages from here. Try again in a minute' }, 429)
      const body = await req.text()
      if (body.length > 4000) return json({ error: 'That is too long' }, 413)
      let r: { vid?: unknown; topic?: unknown; text?: unknown; reply?: unknown; room?: unknown }
      try { r = JSON.parse(body) } catch { return json({ error: 'Could not read that' }, 400) }
      const str = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '')
      const text = str(r?.text, 1000)
      if (text.length < 10) return json({ error: 'Tell us a little more' }, 400)
      const extra = [str(r?.room, 30) && `room ${str(r?.room, 30)}`, str(r?.reply, 100) && `reply to ${str(r?.reply, 100)}`].filter(Boolean).join(' · ')
      await env.STATS.get(env.STATS.idFromName('global')).feedback({
        vid: str(r?.vid, 40), rid: '', game: str(r?.topic, 20) || 'Something else', kind: 'report', text: extra ? `${text} (${extra})` : text,
      })
      return json({ ok: true })
    }
    if (url.pathname === '/internal/analytics') {
      const key = req.headers.get('x-internal-key') ?? ''
      if (!env.INTERNAL_KEY || !sameKey(key, env.INTERNAL_KEY)) return json({ error: 'not found' }, 404)
      const days = Math.max(0, Math.min(365, Number(url.searchParams.get('days') ?? 30) || 0))
      return json(await env.STATS.get(env.STATS.idFromName('global')).analytics(days))
    }
    if (url.pathname === '/internal/stats') {
      const key = req.headers.get('x-internal-key') ?? ''
      if (!env.INTERNAL_KEY || !sameKey(key, env.INTERNAL_KEY)) return json({ error: 'not found' }, 404)
      return json(await env.STATS.get(env.STATS.idFromName('global')).report())
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404)
    // A room link (/r/CODE) is the game page itself. Rooms last a day, so search engines are told not to index them.
    if (/^\/r\/[A-Za-z0-9]{5}$/.test(url.pathname) || /^\/tv(\/[A-Za-z0-9]{5})?$/.test(url.pathname)) {
      const page = await env.ASSETS.fetch(new Request(new URL('/', url), req))
      let res = new Response(page.body, page)
      res.headers.set('x-robots-tag', 'noindex')
      // An invite pasted into WhatsApp shows what it is: this room, not the site's front page.
      if (url.pathname.startsWith('/r/')) {
        const code = url.pathname.slice(3).toUpperCase()
        const title = `Join room ${code} on Game Night`
        const desc = 'Tap to join. Party games you play together, each on your own phone. Free, no app, no sign-up.'
        const set = (v: string) => ({ element(e: Element) { e.setAttribute('content', v) } })
        res = new HTMLRewriter()
          .on('meta[property="og:title"]', set(title)).on('meta[name="twitter:title"]', set(title))
          .on('meta[property="og:description"]', set(desc)).on('meta[name="twitter:description"]', set(desc))
          .on('meta[property="og:url"]', set(`${url.origin}/r/${code}`))
          .on('title', { element(e) { e.setInnerContent(`${title}`) } })
          .transform(res)
      }
      return res
    }
    return env.ASSETS.fetch(req)
  },
}
