import { describe, expect, test } from 'vitest'
import {
  insideTester, joinLines, ringAreaKm2, simplifyLine, simplifyRing,
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
