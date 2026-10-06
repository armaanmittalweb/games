// GeoGuess: a country, capital or city is named; everyone drops a pin on the world map. A pin inside the country,
// or right on the city, scores 100; points fall away with distance.
import { byPoints, type Ctx, type Game } from '../engine'
import { CAPITALS, CITIES, COUNTRIES, type Place } from '../content/geo'
import { Q, SHAPES } from '../content/geo-shapes'
import { allIn } from './util'

interface C { rounds: number; seconds: number; mode: string }
interface Pin { lat: number; lon: number }
interface S {
  places: Place[]
  round: number
  phase: 'pin' | 'reveal'
  until: number
  pins: Record<string, Pin>
  result: Record<string, { km: number; pts: number; at?: Pin }>
  pts: Record<string, number>
  km: Record<string, number[]>
}

const REVEAL_MS = 9000
/** Outlines are drawn to about a kilometre, so a pin this close to the border counts as inside. */
const EDGE_KM = 2
const R = 6371

export function km(a: Pin, b: Pin) {
  const r = Math.PI / 180
  const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const shapeOf = new Map(SHAPES.map(s => [s.n, s]))
const toXY = (p: Pin) => [p.lon / Q, p.lat / Q]

function inside(ring: number[], x: number, y: number) {
  let hit = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** The point on a country's border nearest to a pin, measured on a flat map centred on the pin (east–west steps
 * shrink by cos(latitude)), which is exact enough at the distances where points still change. */
function nearestEdge(rings: number[][], pin: Pin): Pin {
  const k = Math.cos((pin.lat * Math.PI) / 180)
  const px = pin.lon / Q, py = pin.lat / Q, half = 180 / Q
  // East–west steps wrap at the date line, so a pin in Fiji at 179.9° is near land at −179.9°.
  const ex = (x: number) => { let d = x - px; if (d > half) d -= 2 * half; else if (d < -half) d += 2 * half; return d * k }
  let best = Infinity, bx = 0, by = 0
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = ex(r[j]), ay = r[j + 1] - py, cx = ex(r[i]), cy = r[i + 1] - py
      const dx = cx - ax, dy = cy - ay, len = dx * dx + dy * dy
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0
      const x = ax + t * dx, y = ay + t * dy, d = x * x + y * y
      if (d < best) { best = d; bx = x; by = y }
    }
  }
  let lon = pin.lon + (bx / k) * Q
  if (lon > 180) lon -= 360; else if (lon < -180) lon += 360
  return { lat: Math.round((pin.lat + by * Q) * 100) / 100, lon: Math.round(lon * 100) / 100 }
}

/** How far a pin is from a place: 0 inside a country (or on its border), else to the nearest point of its border;
 * for a city, to the city. `at` is the point measured to, for drawing. */
export function distanceTo(place: Place, pin: Pin): { km: number; at?: Pin } {
  if (place.kind !== 'country') return { km: km(place, pin) }
  const s = shapeOf.get(place.shape ?? place.n)
  if (!s) return { km: km(place, pin) }
  const [x, y] = toXY(pin)
  if (s.r.some(r => inside(r, x, y))) return { km: 0 }
  const at = nearestEdge(s.r, pin)
  const d = km(pin, at)
  return d <= EDGE_KM ? { km: 0 } : { km: d, at }
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
    const { km: far, at } = distanceTo(place, pin)
    const d = Math.round(far)
    const p = points(place, d)
    s.result[id] = at && d > 0 ? { km: d, pts: p, at } : { km: d, pts: p }
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
