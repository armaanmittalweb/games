export { Room } from './room'

interface Env {
  ROOMS: DurableObjectNamespace
  ASSETS: Fetcher
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
      for (let i = 0; i < 6; i++) {
        const c = code()
        const res = await env.ROOMS.get(env.ROOMS.idFromName(c)).fetch(`https://room/init?code=${c}`)
        if (res.ok) return json({ code: c })
      }
      return json({ error: 'Could not make a room, try again' }, 503)
    }
    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{5})\/ws$/)
    if (m) {
      const c = m[1].toUpperCase()
      return env.ROOMS.get(env.ROOMS.idFromName(c)).fetch(new Request(`https://room/ws`, req))
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404)
    return env.ASSETS.fetch(req)
  },
}
