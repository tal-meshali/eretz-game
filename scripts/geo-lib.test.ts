import { describe, expect, test } from 'vitest'
import {
  carveRing, insideTester, joinEnds, joinLines, nearTester, nearestWithin, ringAreaKm2,
  simplifyLine, simplifyRing,
} from './geo-lib.mjs'

const square = (x: number, y: number, size: number) => [
  [x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y],
]

describe('insideTester', () => {
  const inside = insideTester([[square(34, 31, 2)]])

  test('separates in from out', () => {
    expect(inside(35, 32)).toBe(true)
    expect(inside(33, 32)).toBe(false)
    expect(inside(35, 34)).toBe(false)
  })

  test('a hole is outside — even-odd across every ring', () => {
    const withHole = insideTester([[square(34, 31, 4), square(35, 32, 2)]])
    expect(withHole(34.5, 31.5)).toBe(true)
    expect(withHole(36, 33)).toBe(false)
  })

  test('the latitude index does not lose a point near a band edge', () => {
    // The edges are bucketed by latitude, so a polygon spanning the whole
    // country crosses every band — a sample that lands on a band boundary is
    // exactly what a bucketing slip would drop.
    const tall = insideTester([[square(34, 29.5, 3.9)]])
    const missed: number[] = []
    for (let lat = 29.6; lat < 33.3; lat += 0.0017) {
      if (!tall(35, lat)) missed.push(lat)
    }
    expect(missed).toEqual([])
  })
})

describe('nearTester', () => {
  // A degree of latitude is ~111.3 km, so 0.01 deg is ~1.11 km.
  const near = nearTester([[square(34, 31, 2)]], 2000)

  test('measures in metres, not degrees', () => {
    expect(near(34, 31)).toBe(true) // on a corner
    expect(near(33.99, 31)).toBe(true) // ~0.95 km west of it
    expect(near(33.95, 31)).toBe(false) // ~4.7 km west
  })

  test('only the vertices count, not the edges between them', () => {
    // Documented, and true of every caller: the borders this is asked about
    // arrive at ~15 m spacing, so the middle of a 200 km edge never comes up.
    expect(near(35, 31)).toBe(false)
  })

  test('sees a vertex in the next cell over', () => {
    // The grid is one tolerance wide, so a point just inside its own cell and
    // a vertex just inside the next are almost touching and must still find
    // each other. Sweeping a query along a dense line lands on every cell
    // boundary there is.
    const dense: [number, number][] = []
    for (let y = 31; y < 33; y += 0.0002) dense.push([34, y])
    const alongIt = nearTester([[dense]], 2000)
    const missed: number[] = []
    for (let y = 31; y < 33; y += 0.00037) {
      if (!alongIt(34.01, y)) missed.push(y) // ~0.95 km east of the line
    }
    expect(missed).toEqual([])
  })
})

describe('carveRing', () => {
  const ring = square(0, 0, 4)
  const dips = [[0, 0], [1, 0], [2, -5], [3, -5], [4, 0], [5, 0]]
  const above = (_x: number, y: number) => y >= 0

  test('a ring that passes everywhere comes back closed and whole', () => {
    expect(carveRing(ring, () => true)).toEqual([ring])
  })

  test('a ring that fails everywhere comes back empty', () => {
    expect(carveRing(ring, () => false)).toEqual([])
  })

  test('a surviving run straddling the ring seam stays one line', () => {
    // square() starts at the south-west corner, so the west side survives as
    // one run that a naive scan would report as two.
    const out = carveRing(ring, (x: number) => x < 2)
    expect(out).toHaveLength(1)
    // It is cut mid-segment at x = 2, on both the top and the bottom edge.
    expect(out[0]!.map(([x, y]) => [Math.round(x * 1e4) / 1e4, y])).toEqual([
      [2, 4], [0, 4], [0, 0], [2, 0],
    ])
  })

  test('two separate runs stay separate', () => {
    expect(carveRing(dips, above)).toEqual([[[0, 0], [1, 0]], [[4, 0], [5, 0]]])
  })

  test('a lone surviving vertex is not a line', () => {
    expect(carveRing([[0, 0], [1, -5], [2, 0], [3, -5], [4, 0]], above)).toEqual([])
  })

  test('the cut lands where the test flips, not at the vertex before it', () => {
    // One 100-long segment dropping away: stopping at the vertex would end the
    // line 100 short of the edge, which is the whole point of cutting it.
    const out = carveRing([[0, 0], [100, 0], [100, -1]], (x: number) => x < 30)
    expect(out).toHaveLength(1)
    expect(out[0]![1]![0]).toBeCloseTo(30, 3)
  })
})

describe('joinEnds', () => {
  const border = nearestWithin([[square(10, 0, 4)]], 2_000_000)

  test('both ends are pulled onto the nearest point', () => {
    expect(joinEnds([[0, 0], [5, 0]], border)).toEqual([[10, 0], [0, 0], [5, 0], [10, 0]])
  })

  test('a closed ring has no ends to pull', () => {
    const ring = square(0, 0, 4)
    expect(joinEnds(ring, border)).toEqual(ring)
  })

  test('an end with nothing in range is left where it is', () => {
    const far = nearestWithin([[square(10, 0, 4)]], 1)
    expect(joinEnds([[0, 0], [5, 0]], far)).toEqual([[0, 0], [5, 0]])
  })
})

describe('simplify', () => {
  test('drops a vertex within tolerance and keeps one outside it', () => {
    // ~55 m off a straight line: dropped at 100 m, kept at 20 m.
    const bowed = [[34, 32], [34.001, 32.0005], [34.002, 32]]
    expect(simplifyLine(bowed, 100)).toHaveLength(2)
    expect(simplifyLine(bowed, 20)).toHaveLength(3)
  })

  test('a ring stays closed', () => {
    const ring = simplifyRing([...square(34, 31, 1)], 50)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  test('a ring never simplifies below a triangle', () => {
    expect(simplifyRing(square(34, 31, 0.0001), 5000).length).toBeGreaterThanOrEqual(4)
  })
})

describe('ringAreaKm2', () => {
  test('a 1° square near Israel is ~10,500 km²', () => {
    expect(Math.abs(ringAreaKm2(square(34, 31, 1)))).toBeCloseTo(10566, -2)
  })
})

describe('joinLines', () => {
  test('chains ways that share an endpoint, in either direction', () => {
    const a = [[34, 32], [34.1, 32]]
    const b = [[34.1, 32], [34.2, 32]]
    const c = [[34.4, 32], [34.2, 32]] // reversed against b's tail
    const [line, ...rest] = joinLines([a, b, c])
    expect(rest).toHaveLength(0)
    expect(line[0]).toEqual([34, 32])
    expect(line[line.length - 1]).toEqual([34.4, 32])
    expect(line).toHaveLength(4)
  })

  test('leaves unconnected ways alone', () => {
    const joined = joinLines([[[34, 32], [34.1, 32]], [[35, 33], [35.1, 33]]])
    expect(joined).toHaveLength(2)
  })

  test('a ring closes instead of looping forever', () => {
    const ring = square(34, 31, 1)
    const halves = [ring.slice(0, 3), ring.slice(2)]
    const [line] = joinLines(halves)
    expect(line[0]).toEqual(line[line.length - 1])
  })

  test('every input vertex survives the join', () => {
    const pieces = [[[34, 32], [34.1, 32]], [[34.1, 32], [34.2, 32]], [[34.2, 32], [34.3, 32]]]
    const total = joinLines(pieces).reduce((n, l) => n + l.length, 0)
    expect(total).toBe(4) // 6 vertices, 2 shared junctions
  })
})
