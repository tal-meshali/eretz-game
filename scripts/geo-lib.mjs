// Geometry helpers for scripts/build-geo.mjs. Kept separate so the shape of
// the pipeline stays readable in the build script itself, and so the pieces
// with real edge cases (inside tests, Douglas-Peucker) can be unit-tested.

/** Metres per degree of latitude — the scale everything here is expressed in. */
export const M_PER_DEG = 111320

/* ---------- multipolygon plumbing ---------- */

export const toMulti = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

export function fromMulti(polys) {
  if (polys.length === 0) return null
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys }
}

/* ---------- inside tests ----------
   Ray casting over every ring of a multipolygon (even-odd, so holes fall out
   for free). The edges are bucketed by latitude band: without that index a
   point test walks all ~27k border edges, and the road layer alone asks for
   half a million of them. */

const BANDS = 2048

export function insideTester(multi) {
  const edges = []
  let s = Infinity
  let n = -Infinity
  for (const poly of multi) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i]
        const [x2, y2] = ring[i + 1]
        if (y1 === y2) continue // horizontal edges can never be crossed
        edges.push([x1, y1, x2, y2])
        s = Math.min(s, y1, y2)
        n = Math.max(n, y1, y2)
      }
    }
  }
  const height = n - s || 1
  const buckets = Array.from({ length: BANDS }, () => [])
  const bandOf = (y) => Math.min(BANDS - 1, Math.max(0, Math.floor(((y - s) / height) * BANDS)))
  for (const e of edges) {
    const lo = bandOf(Math.min(e[1], e[3]))
    const hi = bandOf(Math.max(e[1], e[3]))
    for (let b = lo; b <= hi; b++) buckets[b].push(e)
  }
  return (x, y) => {
    if (y < s || y > n) return false
    let inside = false
    for (const [x1, y1, x2, y2] of buckets[bandOf(y)]) {
      if (y1 > y === y2 > y) continue
      if (x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside
    }
    return inside
  }
}

/* ---------- distance tests ----------
   "Is this point within N metres of that geometry?", answered against the
   geometry's VERTICES rather than its edges. The borders this is asked about
   arrive at ~15 m spacing and the answers are wanted in kilometres, so the
   nearest vertex and the nearest edge are the same answer. Bucketed into a
   grid exactly one tolerance wide, which is what makes the 3x3 block around a
   point enough to see everything that could be in range. */

export function nearTester(multi, metres, lat = 31.5) {
  const kx = Math.cos((lat * Math.PI) / 180)
  const cellY = metres / M_PER_DEG
  const cellX = cellY / kx
  const grid = new Map()
  for (const poly of multi) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        // Flat pairs rather than points: this holds every vertex of both
        // borders, and an array of 27k two-element arrays is all overhead.
        const k = `${Math.floor(x / cellX)},${Math.floor(y / cellY)}`
        const bucket = grid.get(k)
        if (bucket) bucket.push(x, y)
        else grid.set(k, [x, y])
      }
    }
  }
  const sqTol = cellY * cellY
  return (x, y) => {
    const gx = Math.floor(x / cellX)
    const gy = Math.floor(y / cellY)
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const bucket = grid.get(`${gx + i},${gy + j}`)
        if (!bucket) continue
        for (let n = 0; n < bucket.length; n += 2) {
          const dx = (x - bucket[n]) * kx
          const dy = y - bucket[n + 1]
          if (dx * dx + dy * dy <= sqTol) return true
        }
      }
    }
    return false
  }
}

/* ---------- carving a ring into lines ---------- */

/** The runs of `ring` whose vertices all pass `keep`, as open lines. A ring
 *  that passes everywhere comes back whole and still closed; one that fails
 *  everywhere comes back empty. The wrap-around is the point of it: a ring
 *  starts wherever its source happened to start, and a surviving run that
 *  straddles that seam is one line, not two. */
export function carveRing(ring, keep) {
  const closed = ring.length > 2 &&
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const points = closed ? ring.slice(0, -1) : ring
  const ok = points.map(([x, y]) => keep(x, y))
  if (ok.every(Boolean)) return [ring]
  if (!ok.some(Boolean)) return []
  // Start just past a vertex that failed, so no run is cut by the seam.
  let start = 0
  if (closed) while (ok[start]) start++
  const out = []
  let run = []
  for (let i = 0; i < points.length; i++) {
    const at = closed ? (start + i) % points.length : i
    if (ok[at]) {
      run.push(points[at])
      continue
    }
    if (run.length > 1) out.push(run)
    run = []
  }
  if (run.length > 1) out.push(run)
  return out
}

/* ---------- simplification ----------
   Douglas-Peucker with the tolerance given in METRES, not degrees: a degree of
   longitude here is ~0.85 of a degree of latitude, so simplifying in raw
   degrees would thin the east-west detail harder than the north-south. */

const sqSegDist = ([px, py], [ax, ay], [bx, by], kx) => {
  let x = ax
  let y = ay
  let dx = bx - ax
  let dy = by - ay
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = bx
      y = by
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }
  dx = (px - x) * kx
  dy = py - y
  return dx * dx + dy * dy
}

function dp(points, sqTol, kx) {
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let index = -1
    let maxSq = sqTol
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(points[i], points[first], points[last], kx)
      if (sq > maxSq) {
        maxSq = sq
        index = i
      }
    }
    if (index === -1) continue
    keep[index] = 1
    stack.push([first, index], [index, last])
  }
  return points.filter((_, i) => keep[i])
}

/** `lat` sets the longitude foreshortening; one value for the whole country is
 *  plenty over 4 degrees of latitude. */
export function simplifyLine(points, metres, lat = 31.5) {
  if (points.length < 3) return points
  const kx = Math.cos((lat * Math.PI) / 180)
  const tol = metres / M_PER_DEG
  return dp(points, tol * tol, kx)
}

/** A ring keeps its closure and never drops below a triangle. */
export function simplifyRing(ring, metres, lat = 31.5) {
  if (ring.length < 5) return ring
  const out = simplifyLine(ring, metres, lat)
  if (out.length < 4) return ring
  const [fx, fy] = out[0]
  const [lx, ly] = out[out.length - 1]
  if (fx !== lx || fy !== ly) out.push([fx, fy])
  return out
}

/* ---------- measures ---------- */

/** Signed ring area in square kilometres (positive = counter-clockwise). */
export function ringAreaKm2(ring, lat = 31.5) {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  const kx = Math.cos((lat * Math.PI) / 180)
  return (a / 2) * kx * (M_PER_DEG / 1000) ** 2
}

export const roundTo = (v, places) => Number(v.toFixed(places))

/* ---------- line joining ----------
   OSM splits a highway at every change of tag, so Route 6 arrives as hundreds
   of separate ways. Chaining them back into continuous lines is not cosmetic:
   each line becomes one TopoJSON arc, and an arc pays for an absolute
   starting coordinate where every vertex after it costs a small delta. */

const at = ([x, y]) => `${x},${y}`

export function joinLines(lines) {
  const heads = new Map()
  const tails = new Map()
  const index = (map, k, line) => {
    const list = map.get(k)
    if (list) list.push(line)
    else map.set(k, [line])
  }
  const drop = (map, k, line) => {
    const list = map.get(k)
    if (!list) return
    const i = list.indexOf(line)
    if (i >= 0) list.splice(i, 1)
  }
  const pending = new Set()
  for (const line of lines) {
    if (line.length < 2) continue
    pending.add(line)
    index(heads, at(line[0]), line)
    index(tails, at(line[line.length - 1]), line)
  }
  const unlink = (line) => {
    pending.delete(line)
    drop(heads, at(line[0]), line)
    drop(tails, at(line[line.length - 1]), line)
  }
  const pick = (map, k, exclude) => (map.get(k) ?? []).find((l) => l !== exclude && pending.has(l))

  const out = []
  for (const seed of lines) {
    if (!pending.has(seed)) continue
    unlink(seed)
    let line = seed
    // Extend forward, then backward. A junction with three ways on it joins
    // whichever arrives first and leaves the rest as their own lines — the
    // drawn result is identical either way.
    for (;;) {
      const k = at(line[line.length - 1])
      const next = pick(heads, k) ?? pick(tails, k)
      if (!next) break
      unlink(next)
      line = at(next[0]) === k ? line.concat(next.slice(1)) : line.concat(next.slice(0, -1).reverse())
      if (at(line[0]) === at(line[line.length - 1])) break // closed loop
    }
    for (;;) {
      const k = at(line[0])
      const prev = pick(tails, k) ?? pick(heads, k)
      if (!prev) break
      unlink(prev)
      line = at(prev[prev.length - 1]) === k ? prev.slice(0, -1).concat(line) : prev.slice(1).reverse().concat(line)
      if (at(line[0]) === at(line[line.length - 1])) break
    }
    out.push(line)
  }
  return out
}
