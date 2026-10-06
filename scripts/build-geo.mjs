// Builds the GeoGuess map from Natural Earth's 1:10m countries as India sees them (ne_10m_admin_0_countries_ind,
// public domain), so India's borders are drawn as India draws them.
//   node scripts/build-geo.mjs <path to ne_10m_admin_0_countries_ind.geojson>
// Writes:
//   public/geo/lo.json   the whole world, light enough to draw zoomed out (about 5 km of detail)
//   public/geo/hi.json   the same countries with about 1 km of detail, fetched once someone zooms in
//   src/content/geo-shapes.ts   outlines of the countries the game asks about, for scoring (about 2 km of detail)
// Map files: { q, c: [{ n, r: [[x, y, dx, dy, …], …] }] } where a point is (lon, lat) / q, each after the first
// stored as the step from the one before.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'))

/** Douglas–Peucker on a closed ring: split at the point farthest from the first, simplify each half. */
function simplifyRing(ring, tol) {
  const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  if (pts.length < 4) return pts
  let far = 0, at = 0
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > far) { far = d; at = i } })
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify([...pts.slice(at), pts[0]], tol).slice(0, -1)]
}

/** Douglas–Peucker on an open line. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    let best = -1, far = 0
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len
      if (d > far) { far = d; best = i }
    }
    if (far > tol) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
const area = r => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
const dedupe = r => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1])

/** A country's outer rings, simplified to `tol` degrees and snapped to a grid of `q` degrees. Islands smaller than
 * `minArea` square degrees are dropped, but never a country's largest piece. */
function rings(f, tol, q, minArea) {
  const g = f.geometry
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  const snap = r => dedupe(r.map(([lon, lat]) => [Math.round(lon / q), Math.round(lat / q)]))
  let out = polys.map(poly => snap(simplifyRing(poly[0], tol))).filter(r => r.length >= 3 && area(r) > 0)
  // Tiny countries vanish when outlines are simplified: they keep their full outline instead.
  if (!out.length) out = polys.map(poly => snap(poly[0])).filter(r => r.length >= 3)
  const biggest = Math.max(...out.map(area))
  return out.filter(r => area(r) * q * q >= minArea || area(r) === biggest)
}
const deltas = r => r.flatMap((p, i) => (i ? [p[0] - r[i - 1][0], p[1] - r[i - 1][1]] : p))

// The countries the game asks about. Natural Earth files Palestine under Israel; it is asked about on its own.
const ALSO = new Set(['Palestine'])
const SKIP = new Set(['Antarctica', 'Taiwan', 'Bir Tawil', 'Brazilian Island', 'Wake Island', 'Scarborough Shoal'])
const name = f => f.properties.NAME_EN
// A country governs itself: its own sovereign (Natural Earth's ADMIN equals SOVEREIGNT), and not a dependency.
const isCountry = f => !SKIP.has(name(f)) && (ALSO.has(name(f)) || (f.properties.ADMIN === f.properties.SOVEREIGNT && f.properties.TYPE !== 'Dependency'))

const features = src.features.filter(f => name(f) !== 'Antarctica')
const map = (tol, q, minArea) => JSON.stringify({ q, c: features.map(f => ({ n: name(f), r: rings(f, tol, q, minArea).map(deltas) })) })
mkdirSync('public/geo', { recursive: true })
writeFileSync('public/geo/lo.json', map(0.05, 0.002, 0.02))
writeFileSync('public/geo/hi.json', map(0.008, 0.002, 0))

function inside(r, x, y) {
  let hit = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
function edgeDist(r, x, y) {
  let best = Infinity
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[j], [bx, by] = r[i], dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y))
  }
  return best
}
/** Natural Earth's label point, unless it falls in the sea (between islands): then the point of the largest island
 * farthest from its coast. The answer is marked here. */
function labelPoint(f, rs) {
  const x = Math.round(f.properties.LABEL_X / SQ), y = Math.round(f.properties.LABEL_Y / SQ)
  if (rs.some(r => inside(r, x, y))) return [x, y]
  const r = rs.reduce((a, b) => (area(b) > area(a) ? b : a))
  const xs = r.map(p => p[0]), ys = r.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  let best = [r[0][0], r[0][1]], far = -1
  for (let i = 1; i < 60; i++) for (let j = 1; j < 60; j++) {
    const px = x0 + ((x1 - x0) * i) / 60, py = y0 + ((y1 - y0) * j) / 60
    if (!inside(r, px, py)) continue
    const d = edgeDist(r, px, py)
    if (d > far) { far = d; best = [px, py] }
  }
  return best.map(Math.round)
}
const SQ = 0.002
const shapes = features.filter(isCountry).map(f => {
  const rs = rings(f, 0.02, SQ, 0.0005)
  const [lon, lat] = labelPoint(f, rs)
  return { n: name(f), lat: +(lat * SQ).toFixed(2), lon: +(lon * SQ).toFixed(2), r: rs.map(deltas) }
})
writeFileSync('src/content/geo-shapes.ts', `// Generated by scripts/build-geo.mjs from Natural Earth (public domain), as India sees borders. Each country's
// outline in steps of Q degrees, flat [lon, lat, lon, lat, …] per ring, and a point inside it where its answer is marked.
export const Q = ${SQ}
export interface Shape { n: string; lat: number; lon: number; r: number[][] }
// Stored as steps from the point before; undone once on load.
const STEPS: Shape[] = ${JSON.stringify(shapes)}
export const SHAPES: Shape[] = STEPS.map(s => ({ ...s, r: s.r.map(r => { const o = r.slice(); for (let i = 2; i < o.length; i++) o[i] += o[i - 2]; return o }) }))
`)
const kb = f => Math.round(readFileSync(f).length / 1024)
const pts = f => JSON.parse(readFileSync(f, 'utf8')).c.reduce((a, c) => a + c.r.reduce((b, r) => b + r.length / 2, 0), 0)
console.log(`lo ${kb('public/geo/lo.json')} KB (${pts('public/geo/lo.json')} points), hi ${kb('public/geo/hi.json')} KB (${pts('public/geo/hi.json')} points), ${shapes.length} countries to ask (${kb('src/content/geo-shapes.ts')} KB)`)
