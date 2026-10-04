// The contract between the room and a game. A room seats players, keeps the clock and delivers messages; a game is a
// set of plain functions over its own state, so every game can be run and tested without a Durable Object.

export interface Standing {
  id: string
  place: number // 1 = winner; players level after every tie-break share a place
  score: number | string // what the results table shows
  detail?: string
}

export interface Ctx<C = Record<string, unknown>> {
  now: number
  config: C
  /** Seated players, in seat order. */
  players: string[]
  names: Record<string, string>
  /** Seat colours (index into the palette), for drawings and pieces. */
  colors: Record<string, number>
  online: Set<string>
  rand(): number
  int(n: number): number
  pick<T>(a: readonly T[]): T
  shuffle<T>(a: T[]): T[]
  /**
   * n items from a content pool, never repeating until the whole pool has been used. Every room on the site walks the
   * pool in one fixed shuffled order and shares its place in it, so a group meets each item once per lap of the pool.
   * key names the pool, and must change with any filter applied to items.
   */
  deal<T>(key: string, items: readonly T[], n: number): T[]
  /** When the game next needs a tick (a deadline). 0 clears it. Each call replaces the last. */
  wake(at: number): void
  /** Ends the game. Standings must include every seated player. */
  end(standings: Standing[], summary?: unknown): void
  /** A message that is not part of the state (a pen stroke), sent to some or all sockets. */
  emit(msg: unknown, to?: string | string[]): void
  /** This action changed nothing anyone needs a fresh state for (emit carries it). */
  quiet(): void
  /** Persist this change lazily: it is cheap to lose a few seconds of it if the room is evicted. */
  lazy(): void
  /** Large values kept outside the state (drawings). Cleared when the next game starts. */
  put(key: string, value: unknown): void
  get<T>(key: string): T | undefined
}

export interface Game<S = any, C = any> {
  setup(g: Ctx<C>): S
  /** Returns an error message for the player, or nothing. */
  act(g: Ctx<C>, s: S, pid: string, m: Record<string, unknown>): string | void
  /** Called once the time set with wake() has come. */
  tick?(g: Ctx<C>, s: S): void
  /** Someone joined mid-game. Return true to seat them (they are added to players). */
  join?(g: Ctx<C>, s: S, pid: string): boolean
  /** A seated player was removed from the room. */
  leave?(g: Ctx<C>, s: S, pid: string): void
  /** What one player (or a spectator, who is not in players) sees. Never include what they must not know. */
  view(g: Ctx<C>, s: S, pid: string): unknown
  /** A legal move for tests; null when this player has nothing to do. */
  bot?(g: Ctx<C>, s: S, pid: string): Record<string, unknown> | null
}

/** Ranks by a key (lower first, compared element by element). Equal keys share a place. */
export function rank<T extends { id: string }>(items: T[], key: (t: T) => number[], score: (t: T) => number | string, detail?: (t: T) => string): Standing[] {
  const keyed = items.map(t => ({ t, k: key(t) }))
  keyed.sort((a, b) => cmp(a.k, b.k))
  const out: Standing[] = []
  keyed.forEach((x, i) => {
    const place = i > 0 && cmp(x.k, keyed[i - 1].k) === 0 ? out[i - 1].place : i + 1
    out.push({ id: x.t.id, place, score: score(x.t), detail: detail?.(x.t) })
  })
  return out
}

export function cmp(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

/** Ranks by points, highest first. */
export const byPoints = (pts: Record<string, number>, ids: string[], detail?: (id: string) => string) =>
  rank(ids.map(id => ({ id })), t => [-(pts[t.id] ?? 0)], t => pts[t.id] ?? 0, detail ? t => detail(t.id) : undefined)

/** Lower-cases, trims and folds the small differences people make when typing the same answer. */
export function norm(s: unknown) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Crypto-backed randomness for a room. */
export function rng() {
  const buf = new Uint32Array(64)
  let i = buf.length
  const rand = () => {
    if (i >= buf.length) { crypto.getRandomValues(buf); i = 0 }
    return buf[i++] / 4294967296
  }
  const int = (n: number) => Math.floor(rand() * n)
  return {
    rand, int,
    pick: <T>(a: readonly T[]) => a[int(a.length)],
    shuffle: <T>(a: T[]) => { for (let j = a.length - 1; j > 0; j--) { const k = int(j + 1); [a[j], a[k]] = [a[k], a[j]] } return a },
  }
}

// ---------- dealing ----------

const orders = new Map<string, number[]>()

function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}

/** The fixed shuffled order a pool is dealt in: by a hash of each item, so adding items keeps the rest in the same order. */
export function dealOrder(key: string, items: readonly unknown[]): number[] {
  const memo = `${key}:${items.length}`
  let o = orders.get(memo)
  if (!o) {
    o = items.map((t, i) => [hash(`${key}|${typeof t === 'string' ? t : JSON.stringify(t)}`), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[1])
    orders.set(memo, o)
  }
  return o
}

/** Items at positions at, at+1, … of a pool's order (wrapping round). */
export function dealAt<T>(key: string, items: readonly T[], n: number, at: number): T[] {
  const o = dealOrder(key, items)
  const out: T[] = []
  for (let i = 0; i < Math.min(n, o.length); i++) out.push(items[o[(at + i) % o.length]])
  return out
}
