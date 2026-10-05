// GeoGuess: a country, capital or city is named; everyone drops a pin on the world map. A pin inside the country,
// or right on the city, scores 100; points fall away with distance.
import { byPoints, type Ctx, type Game } from '../engine'
import { CAPITALS, CITIES, COUNTRIES, type Place } from '../content/geo'
import { SHAPES } from '../content/geo-shapes'
import { allIn } from './util'

interface C { rounds: number; seconds: number; mode: string }
interface Pin { lat: number; lon: number }
interface S {
  places: Place[]
  round: number
  phase: 'pin' | 'reveal'
  until: number
  pins: Record<string, Pin>
  result: Record<string, { km: number; pts: number }>
  pts: Record<string, number>
  km: Record<string, number[]>
}

const REVEAL_MS = 8000
const R = 6371

export function km(a: Pin, b: Pin) {
  const r = Math.PI / 180
  const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const shapeOf = new Map(SHAPES.map(s => [s.n, s]))
const toXY = (p: Pin) => [(p.lon + 180) * 10, (90 - p.lat) * 10]

function inside(ring: number[], x: number, y: number) {
  let hit = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** How far a pin is from a place: 0 inside a country, else to its nearest edge point; for a city, to the city. */
export function distanceTo(place: Place, pin: Pin) {
  if (place.kind !== 'country') return km(place, pin)
  const s = shapeOf.get(place.shape ?? place.n)
  if (!s) return km(place, pin)
  const [x, y] = toXY(pin)
  if (s.r.some(r => inside(r, x, y))) return 0
  let best = Infinity
  for (const r of s.r) for (let i = 0; i < r.length; i += 2) best = Math.min(best, km(pin, { lon: r[i] / 10 - 180, lat: 90 - r[i + 1] / 10 }))
  return best
}

/** 100 for a hit, half at about 550 km (a country's border is closer to a miss than a city is). */
export const points = (place: Place, d: number) => Math.round(100 * Math.exp(-d / (place.kind === 'country' ? 600 : 800)))

const POOLS: Record<string, Place[]> = { countries: COUNTRIES, capitals: CAPITALS, cities: CITIES, mixed: [...COUNTRIES, ...CAPITALS, ...CITIES] }

function open(g: Ctx<C>, s: S) {
  s.phase = 'pin'
  s.pins = {}
  s.result = {}
  s.until = g.now + g.config.seconds * 1000
  g.wake(s.until)
}

function reveal(g: Ctx<C>, s: S) {
  const place = s.places[s.round]
  for (const [id, pin] of Object.entries(s.pins)) {
    const d = Math.round(distanceTo(place, pin))
    const p = points(place, d)
    s.result[id] = { km: d, pts: p }
    s.pts[id] = (s.pts[id] ?? 0) + p
    ;(s.km[id] ??= []).push(d)
  }
  s.phase = 'reveal'
  s.until = g.now + REVEAL_MS
  g.wake(s.until)
}

export const geoguess: Game<S, C> = {
  setup(g) {
    const mode = POOLS[g.config.mode] ? g.config.mode : 'mixed'
    const s: S = { places: g.deal(`geo:${mode}`, POOLS[mode], g.config.rounds), round: 0, phase: 'pin', until: 0, pins: {}, result: {}, pts: {}, km: {} }
    open(g, s)
    return s
  },
  join() { return true },
  act(g, s, id, m) {
    // A pin is placed on the page and sent once, when the player locks it in.
    if (m.a !== 'pin' || s.phase !== 'pin' || s.pins[id]) return
    const lat = Number(m.lat), lon = Number(m.lon)
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return 'Tap the map'
    s.pins[id] = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 }
    if (allIn(g, s.pins)) reveal(g, s)
  },
  tick(g, s) {
    if (s.phase === 'pin') return reveal(g, s)
    if (s.round + 1 >= s.places.length) {
      const avg = (id: string) => { const k = s.km[id] ?? []; return k.length ? Math.round(k.reduce((a, b) => a + b, 0) / k.length) : null }
      return g.end(byPoints(s.pts, g.players, id => (avg(id) === null ? 'no pins' : `${avg(id)!.toLocaleString('en-IN')} km off on average`)))
    }
    s.round++
    open(g, s)
  },
  view(g, s, id) {
    const p = s.places[s.round]
    const reveal = s.phase === 'reveal'
    return {
      round: s.round, rounds: s.places.length, phase: s.phase, until: s.until, kind: p.kind, name: p.n,
      mine: s.pins[id] ?? null, pinned: Object.keys(s.pins), pts: s.pts,
      answer: reveal ? { lat: p.lat, lon: p.lon, of: p.of ?? null, shape: p.shape ?? null } : null,
      pins: reveal ? s.pins : null, result: reveal ? s.result : null,
    }
  },
  bot(g, s, id) {
    if (s.phase !== 'pin' || s.pins[id] || g.rand() < 0.5) return null
    const p = s.places[s.round]
    return { a: 'pin', lat: Math.max(-80, Math.min(80, p.lat + (g.rand() - 0.5) * 30)), lon: Math.max(-179, Math.min(179, p.lon + (g.rand() - 0.5) * 40)) }
  },
}
