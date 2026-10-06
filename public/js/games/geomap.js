// The GeoGuess world map, drawn on a canvas: a Mercator map (the one phones use) that pans with momentum, zooms with
// a pinch, the scroll wheel or the buttons, and wraps round at the date line. Outlines come from Natural Earth
// (public domain) with India's borders as India draws them, at two levels of detail: about 5 km for the whole
// world and about 1 km once zoomed in (fetched the first time it is needed).

// World units: x = lon + 180 (0 to 360), y = Mercator, 0 at 85° N to 360 at 85° S, so a unit is a degree of longitude.
const R2D = 180 / Math.PI
export const projY = lat => 180 - R2D * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) / (2 * R2D)))
export const unprojY = y => (2 * Math.atan(Math.exp((180 - y) / R2D)) - Math.PI / 2) * R2D
const wrapLon = lon => ((((lon + 180) % 360) + 360) % 360) - 180
const TOP = projY(84), BOTTOM = projY(-60)
const Z_MAX = 2400 // pixels per degree: about 50 m a pixel at the equator
const HI_AT = 10 // pixels per degree from which the detailed outlines are drawn

const maps = {}
/** Fetches one level of detail and turns it into paths: [{ n, path, rings: [{ box, pts }], box }] in world units. */
function load(which) {
  return (maps[which] ??= fetch(`/geo/${which}.json?v=2`).then(r => r.json()).then(({ q, c }) => c.map(({ n, r }) => {
    const path = new Path2D()
    let box = [Infinity, Infinity, -Infinity, -Infinity]
    const rings = r.map(d => {
      const pts = new Float64Array(d.length)
      let lon = 0, lat = 0
      const b = [Infinity, Infinity, -Infinity, -Infinity]
      for (let i = 0; i < d.length; i += 2) {
        lon += d[i]; lat += d[i + 1]
        const x = lon * q + 180, y = projY(lat * q)
        pts[i] = x; pts[i + 1] = y
        if (i) path.lineTo(x, y); else path.moveTo(x, y)
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y
      }
      path.closePath()
      box = [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]
      return { box: b, pts }
    })
    return { n, path, rings, box }
  })).catch(e => { delete maps[which]; throw e }))
}

function insideRing(pts, x, y) {
  let hit = false
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** A rounded box (roundRect is missing on older phones). */
function pill(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r)
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One map on one canvas. `set()` passes in what to show:
 *   pin: { lat, lon, color, label } or null — the player's own pin while they choose
 *   reveal: { target: { lat, lon, label, shape }, pins: [{ id, lat, lon, at, color, label, note }] } or null
 *   onPin(latLon) — called on a tap, or null when tapping does nothing
 */
export class GeoMap {
  constructor(canvas) {
    this.cv = canvas
    this.ctx = canvas.getContext('2d')
    this.W = 1; this.H = 1; this.dpr = 1
    this.z = 1; this.cx = 190; this.cy = 160
    this.lo = null; this.hi = null
    this.props = { pin: null, reveal: null, onPin: null }
    this.pointers = new Map()
    this.anim = null // a fly: { from, to, t0, ms }
    this.spin = null // momentum: { vx, vy, t }
    this.revealAt = 0
    this.pinAt = 0
    this.frame = 0
    this.colors = null
    this.listen()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.theme = new MutationObserver(() => { this.colors = null; this.draw() })
    this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    this.resize()
    this.home(false)
    load('lo').then(m => { this.lo = m; this.ready?.(); this.draw() }, () => { this.failed = true; this.draw() })
    // The detailed map is fetched once the world is up, so it is there by the time anyone zooms in.
    setTimeout(() => this.wantHi(), 1500)
  }

  destroy() {
    this.ro.disconnect(); this.theme.disconnect()
    cancelAnimationFrame(this.frame)
    this.dead = true
  }

  wantHi() {
    if (this.hi || this.hiLoading || this.dead) return
    this.hiLoading = true
    load('hi').then(m => { this.hi = m; this.draw() }, () => { this.hiLoading = false })
  }

  set(props) {
    const was = this.props
    this.props = props
    if (props.pin && (!was.pin || was.pin.lat !== props.pin.lat || was.pin.lon !== props.pin.lon)) this.pinAt = performance.now()
    if (props.reveal && !was.reveal) {
      this.revealAt = 0
      // The answer is flown to once the map is loaded (its outline sets the zoom).
      if (this.lo) this.showAnswer(); else this.ready = () => { this.ready = null; if (this.props.reveal) this.showAnswer() }
    }
    if (!props.reveal && was.reveal) { this.revealAt = 0; this.home(true) }
    this.draw()
  }

  // ——— view ———

  get zMin() { return Math.min(this.W / 360, this.H / (BOTTOM - projY(78))) }

  clamp() {
    this.z = Math.max(this.zMin, Math.min(Z_MAX, this.z))
    const half = this.H / 2 / this.z
    if (half * 2 >= BOTTOM - TOP) this.cy = (TOP + BOTTOM) / 2
    else this.cy = Math.max(TOP + half, Math.min(BOTTOM - half, this.cy))
    this.cx = ((this.cx % 360) + 360) % 360
  }

  resize() {
    const r = this.cv.getBoundingClientRect()
    if (!r.width || !r.height) return
    const first = this.W === 1
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1)
    this.W = r.width; this.H = r.height
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr)
    if (first) this.home(false)
    this.clamp()
    this.draw()
  }

  /** The whole world on a wide screen, centred a little east of Greenwich so Asia and the Americas both show. On a
   * tall phone screen the lands fill its height instead, centred on Africa, Europe and Asia (drag for the Americas). */
  home(animate) {
    const top = projY(75), bottom = projY(-56)
    const tall = this.H > this.W
    const to = { z: tall ? this.H / (bottom - top) : this.zMin, cx: tall ? 235 : 190, cy: (top + bottom) / 2 }
    if (animate && !still()) this.fly(to, 600)
    else { Object.assign(this, to); this.anim = null; this.clamp(); this.draw() }
  }

  toScreen(x, y) {
    // The copy of the point nearest the middle of the view.
    const dx = ((((x - this.cx) % 360) + 540) % 360) - 180
    return [this.W / 2 + dx * this.z, this.H / 2 + (y - this.cy) * this.z]
  }
  toWorld(sx, sy) { return [this.cx + (sx - this.W / 2) / this.z, this.cy + (sy - this.H / 2) / this.z] }
  latLonAt(sx, sy) {
    const [x, y] = this.toWorld(sx, sy)
    return { lat: Math.round(unprojY(y) * 1000) / 1000, lon: Math.round(wrapLon(x - 180) * 1000) / 1000 }
  }

  zoomAt(f, sx = this.W / 2, sy = this.H / 2) {
    const [wx, wy] = this.toWorld(sx, sy)
    this.z = Math.max(this.zMin, Math.min(Z_MAX, this.z * f))
    this.cx = wx - (sx - this.W / 2) / this.z
    this.cy = wy - (sy - this.H / 2) / this.z
    this.clamp()
    if (this.z >= HI_AT / 2) this.wantHi()
    this.draw()
  }

  /** Animated zoom for the buttons. */
  zoomBy(f) {
    if (still()) return this.zoomAt(f)
    const [wx, wy] = [this.cx, this.cy]
    this.fly({ z: Math.max(this.zMin, Math.min(Z_MAX, this.z * f)), cx: wx, cy: wy }, 280)
  }

  fly(to, ms) {
    this.spin = null
    // Go the short way round the date line.
    const cx = this.cx + ((((to.cx - this.cx) % 360) + 540) % 360) - 180
    this.anim = { from: { z: this.z, cx: this.cx, cy: this.cy }, to: { ...to, cx }, t0: performance.now(), ms }
    if (to.z >= HI_AT / 2) this.wantHi()
    this.draw()
  }

  /** Flies to fit the answer, the pins and the lines between them. */
  showAnswer() {
    const { target, pins } = this.props.reveal
    const tx = target.lon + 180, ty = projY(target.lat)
    const pts = [[tx, ty]]
    // A country is fitted by the piece of it holding its marker (France without its islands across the sea).
    const c = target.shape && this.lo?.find(c => c.n === target.shape)
    if (c) {
      const ring = c.rings.filter(r => insideRing(r.pts, tx, ty)).sort((a, b) => (a.box[2] - a.box[0]) - (b.box[2] - b.box[0]))[0]
      const b = ring?.box ?? c.box
      if (b[2] - b[0] < 180) pts.push([b[0], b[1]], [b[2], b[3]])
    }
    for (const p of pins) {
      pts.push([p.lon + 180, projY(p.lat)])
      if (p.at) pts.push([p.at.lon + 180, projY(p.at.lat)])
    }
    // Unwrap round the answer, so a pin just across the date line counts as close.
    const xs = pts.map(([x]) => tx + ((((x - tx) % 360) + 540) % 360) - 180), ys = pts.map(([, y]) => y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    // Room for names round the edges, and for the zoom buttons on the right.
    const padL = 56, padR = 72, padTop = 64, padBottom = 52
    const z = Math.max(this.zMin, Math.min(260, (this.W - padL - padR) / Math.max(x1 - x0, 1e-6), (this.H - padTop - padBottom) / Math.max(y1 - y0, 1e-6)))
    const to = { z, cx: (x0 + x1) / 2 + (padR - padL) / 2 / z, cy: (y0 + y1) / 2 - (padTop - padBottom) / 2 / z }
    if (still()) { Object.assign(this, to); this.clamp(); this.revealAt = performance.now(); this.draw(); return }
    this.fly(to, 1100)
    this.anim.then = () => { this.revealAt = performance.now() }
  }

  // ——— input ———

  listen() {
    const cv = this.cv
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId)
      this.anim = null; this.spin = null
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const r = cv.getBoundingClientRect()
      if (this.pointers.size === 1) {
        this.gesture = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, multi: false, touch: e.pointerType !== 'mouse', track: [] }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.z, w: this.toWorld(mx, my) }
        if (this.gesture) this.gesture.multi = true
      }
      cv.classList.add('grab')
    })
    cv.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      const g = this.gesture
      const r = cv.getBoundingClientRect()
      if (this.pointers.size >= 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()]
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
        this.z = Math.max(this.zMin, Math.min(Z_MAX, this.pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d)))
        this.cx = this.pinch.w[0] - (mx - this.W / 2) / this.z
        this.cy = this.pinch.w[1] - (my - this.H / 2) / this.z
        this.clamp()
        if (this.z >= HI_AT / 2) this.wantHi()
        this.draw()
        return
      }
      if (!g) return
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > (g.touch ? 10 : 5)) g.moved = true
      if (!g.moved) return
      this.cx -= dx / this.z; this.cy -= dy / this.z
      this.clamp()
      const t = performance.now()
      g.track.push({ t, x: e.clientX, y: e.clientY })
      while (g.track.length > 2 && t - g.track[0].t > 100) g.track.shift()
      this.draw()
    })
    const end = e => {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.delete(e.pointerId)
      const g = this.gesture
      if (this.pointers.size < 2) this.pinch = null
      if (this.pointers.size === 1) {
        // Pinch over, one finger still down: carry on dragging from where it is.
        const [p] = [...this.pointers.values()]
        if (g) { g.track = []; g.x = p.x; g.y = p.y }
        return
      }
      if (this.pointers.size) return
      cv.classList.remove('grab')
      this.gesture = null
      if (!g || e.type === 'pointercancel') return
      if (!g.moved && !g.multi && performance.now() - g.t < 700) {
        const r = cv.getBoundingClientRect()
        this.props.onPin?.(this.latLonAt(e.clientX - r.left, e.clientY - r.top))
        return
      }
      // A flick keeps the map gliding.
      const tr = g.track
      if (tr.length >= 2 && !still()) {
        const a = tr[0], b = tr[tr.length - 1], dt = b.t - a.t
        if (dt > 0 && performance.now() - b.t < 60) {
          const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt
          if (Math.hypot(vx, vy) > 0.25) { this.spin = { vx, vy, t: performance.now() }; this.draw() }
        }
      }
    }
    cv.addEventListener('pointerup', end)
    cv.addEventListener('pointercancel', end)
    cv.addEventListener('wheel', e => {
      e.preventDefault()
      this.anim = null; this.spin = null
      const r = cv.getBoundingClientRect()
      const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1)
      // A trackpad pinch arrives as a wheel with ctrl held, in small steps.
      this.zoomAt(Math.exp(-d * (e.ctrlKey ? 0.012 : 0.0025)), e.clientX - r.left, e.clientY - r.top)
    }, { passive: false })
    cv.addEventListener('dblclick', e => {
      const r = cv.getBoundingClientRect()
      const [wx, wy] = this.toWorld(e.clientX - r.left, e.clientY - r.top)
      const z = Math.min(Z_MAX, this.z * 2.5)
      this.fly({ z, cx: wx - (e.clientX - r.left - this.W / 2) / z, cy: wy - (e.clientY - r.top - this.H / 2) / z }, 320)
    })
    cv.addEventListener('keydown', e => {
      const step = 90 / this.z
      const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (keys[e.key]) { this.cx += keys[e.key][0]; this.cy += keys[e.key][1]; this.clamp(); this.draw() }
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.8)
      else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.8)
      else if (e.key === 'Enter' || e.key === ' ') this.props.onPin?.(this.latLonAt(this.W / 2, this.H / 2))
      else return
      e.preventDefault()
    })
  }

  // ——— drawing ———

  draw() {
    if (this.queued || this.dead) return
    this.queued = true
    this.frame = requestAnimationFrame(t => { this.queued = false; this.paint(t) })
  }

  palette() {
    if (this.colors) return this.colors
    const s = getComputedStyle(this.cv)
    const v = k => s.getPropertyValue(k).trim()
    return (this.colors = { sea: v('--geo-sea'), land: v('--geo-land'), edge: v('--geo-edge'), grid: v('--geo-grid'), hit: v('--geo-hit'), hitEdge: v('--geo-hit-edge') })
  }

  paint(now) {
    let busy = false
    if (this.anim) {
      const { from, to, t0, ms } = this.anim
      const k = Math.min(1, (now - t0) / ms), e = ease(k)
      // Zoom moves in ratios, so a long zoom feels as even as a short one.
      this.z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e)
      this.cx = from.cx + (to.cx - from.cx) * e
      this.cy = from.cy + (to.cy - from.cy) * e
      this.clamp()
      if (k >= 1) { const then = this.anim.then; this.anim = null; then?.() } else busy = true
    }
    if (this.spin) {
      const dt = Math.min(40, now - this.spin.t)
      this.spin.t = now
      this.cx -= (this.spin.vx * dt) / this.z; this.cy -= (this.spin.vy * dt) / this.z
      const f = Math.pow(0.994, dt)
      this.spin.vx *= f; this.spin.vy *= f
      this.clamp()
      if (Math.hypot(this.spin.vx, this.spin.vy) < 0.02) this.spin = null; else busy = true
    }
    const { ctx, W, H, dpr, z } = this
    const c = this.palette()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = c.sea
    ctx.fillRect(0, 0, W, H)
    this.grid(c)
    const countries = z >= HI_AT && this.hi ? this.hi : this.lo
    const hitName = this.props.reveal?.target.shape
    if (countries) {
      const left = this.cx - W / 2 / z, right = this.cx + W / 2 / z, top = this.cy - H / 2 / z, bottom = this.cy + H / 2 / z
      ctx.lineJoin = 'round'
      for (let k = Math.floor(left / 360); k <= Math.floor(right / 360); k++) {
        const off = k * 360
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 + (off - this.cx) * z), dpr * (H / 2 - this.cy * z))
        ctx.lineWidth = 0.8 / z
        ctx.fillStyle = c.land; ctx.strokeStyle = c.edge
        let hit = null
        for (const country of countries) {
          const b = country.box
          if (b[2] + off < left || b[0] + off > right || b[3] < top || b[1] > bottom) continue
          if (country.n === hitName) { hit = country; continue }
          ctx.fill(country.path)
          ctx.stroke(country.path)
        }
        if (hit) {
          // The answer glows in gold, drawn last so its whole border shows.
          const pulse = this.revealAt ? 0.75 + 0.25 * Math.sin((now - this.revealAt) / 260) : 1
          ctx.globalAlpha = pulse
          ctx.fillStyle = c.hit; ctx.fill(hit.path)
          ctx.globalAlpha = 1
          ctx.lineWidth = 1.6 / z; ctx.strokeStyle = c.hitEdge; ctx.stroke(hit.path)
        }
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (this.props.reveal) busy = this.paintReveal(now) || busy
    else if (this.props.pin) busy = this.paintPin(this.props.pin, now - this.pinAt) || busy
    this.scale()
    if (!countries) {
      ctx.fillStyle = c.edge; ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(this.failed ? 'The map did not load. Refresh the page.' : 'Loading the map…', W / 2, H / 2)
    }
    if (busy) this.draw()
  }

  /** Lines of latitude and longitude, closer together the further in. */
  grid(c) {
    const { ctx, W, H, z } = this
    const step = [30, 10, 5, 2, 1, 0.5, 0.2, 0.1].find(s => s * z < 160) ?? 0.1
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1
    ctx.beginPath()
    const left = this.cx - W / 2 / z, right = this.cx + W / 2 / z
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) { const sx = W / 2 + (x - this.cx) * z; ctx.moveTo(sx, 0); ctx.lineTo(sx, H) }
    const latTop = unprojY(this.cy - H / 2 / z), latBottom = unprojY(this.cy + H / 2 / z)
    for (let lat = Math.ceil(latBottom / step) * step; lat <= latTop; lat += step) { const sy = H / 2 + (projY(lat) - this.cy) * z; ctx.moveTo(0, sy); ctx.lineTo(W, sy) }
    ctx.stroke()
  }

  /** A scale bar for the middle of the view. */
  scale() {
    const { ctx, z, H } = this
    const km = (111.32 * Math.cos(unprojY(this.cy) / R2D)) / z // km a pixel
    const len = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter(n => n / km <= 90).pop()
    if (!len) return
    const w = len / km, x = 12, y = H - 12
    ctx.fillStyle = 'rgba(0,0,0,.45)'
    pill(ctx, x - 6, y - 21, w + 12, 27, 6); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(len < 1 ? `${len * 1000} m` : `${len.toLocaleString('en-IN')} km`, x + w / 2, y - 8)
  }

  /** A map pin with its point at (sx, sy), dropping in over its first 350 ms. */
  drawPin(sx, sy, color, letter, age = 1e9) {
    const { ctx } = this
    const k = Math.max(0, Math.min(1, age / 350))
    const drop = still() ? 0 : (1 - ease(k)) * -26
    const r = 11, cy = sy - 24 + drop
    ctx.save()
    ctx.globalAlpha = Math.min(1, 0.3 + k)
    ctx.fillStyle = 'rgba(0,0,0,.28)'
    ctx.beginPath(); ctx.ellipse(sx, sy, 6 * (0.6 + 0.4 * k), 2.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath()
    ctx.arc(sx, cy, r, Math.PI * 0.82, Math.PI * 0.18)
    ctx.lineTo(sx, sy + drop)
    ctx.closePath()
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2
    ctx.fillStyle = color; ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke()
    ctx.fillStyle = '#16161a'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(letter, sx, cy + 0.5)
    ctx.restore()
    return k < 1
  }

  paintPin(pin, age) {
    const [sx, sy] = this.toScreen(pin.lon + 180, projY(pin.lat))
    return this.drawPin(sx, sy, pin.color, pin.label, age)
  }

  /** A label in a dark pill, kept inside the map. */
  tag(text, sx, sy, { bold = false, color = '#fff', size = 13 } = {}) {
    const { ctx, W } = this
    ctx.font = `${bold ? 700 : 600} ${size}px system-ui, sans-serif`
    const w = ctx.measureText(text).width + 16, h = size + 10
    const x = Math.max(4, Math.min(W - w - 4, sx - w / 2)), y = Math.max(4, sy - h)
    ctx.fillStyle = 'rgba(14,14,18,.86)'
    pill(ctx, x, y, w, h, h / 2); ctx.fill()
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(text, x + 8, y + h / 2 + 0.5)
  }

  paintReveal(now) {
    const { ctx } = this
    const { target, pins } = this.props.reveal
    const t = this.revealAt ? now - this.revealAt : 0
    const [tx, ty] = this.toScreen(target.lon + 180, projY(target.lat))
    // Dashed lines from each pin to the answer (to the nearest point of a country's border) draw themselves in.
    const grow = this.revealAt ? (still() ? 1 : Math.min(1, t / 700)) : 0
    ctx.save()
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.lineCap = 'round'
    for (const p of pins) {
      const to = p.at ?? (target.shape ? null : target)
      if (!to) continue
      const [ax, ay] = this.toScreen(p.lon + 180, projY(p.lat))
      let [bx, by] = this.toScreen(to.lon + 180, projY(to.lat))
      // Both ends are placed near the middle of the view, so a line never runs the long way round.
      if (Math.abs(bx - ax) > 180 * this.z) bx += bx > ax ? -360 * this.z : 360 * this.z
      ctx.strokeStyle = 'rgba(255,255,255,.9)'
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * grow, ay + (by - ay) * grow); ctx.stroke()
    }
    ctx.restore()
    // The answer: rings ripple out from it, whatever its size on screen.
    if (!still()) {
      for (let i = 0; i < 2; i++) {
        const k = ((now / 1400) + i / 2) % 1
        ctx.strokeStyle = `rgba(245,197,66,${(1 - k) * 0.9})`; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(tx, ty, 8 + k * 30, 0, Math.PI * 2); ctx.stroke()
      }
    }
    ctx.fillStyle = '#f5c542'; ctx.strokeStyle = '#3d2f00'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#3d2f00'
    ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fill()
    this.tag(target.label, tx, ty - 14, { bold: true, size: 14, color: '#f5c542' })
    if (!this.revealAt) return true
    // Pins, then names, so no pin covers a name.
    const placed = pins.map(p => [p, ...this.toScreen(p.lon + 180, projY(p.lat))])
    placed.sort((a, b) => a[2] - b[2])
    let busy = false
    for (const [p, sx, sy] of placed) busy = this.drawPin(sx, sy, p.color, p.label, t - 150) || busy
    if (placed.length <= 6) for (const [p, sx, sy] of placed) this.tag(p.note, sx, sy + 28, { size: 11, color: p.color })
    this.tag(target.label, tx, ty - 14, { bold: true, size: 14, color: '#f5c542' })
    return true // the answer keeps rippling
  }
}
