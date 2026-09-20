import { describe, expect, test } from 'vitest'
import pc from 'polygon-clipping'
import { PLATE, byRole } from '../ui/mapPlate'

/* The sea is built as "the region minus every landmass", so it inherits every
   disagreement between the surveys the landmasses come from. Israel and the
   West Bank are geoBoundaries at ~15 m; the neighbours are Natural Earth
   1:10m, which draws the Egyptian border a median 2.1 km away. Nothing owned
   the ground in between, so the sea took it and painted a blue band down the
   Egyptian and Syrian borders. scripts/build-geo.mjs now fills those gaps
   with flat neighbour ground before subtracting.

   These boxes hold no real water at all, so any sea inside one is that bug
   coming back. */
type Ring = [number, number][]

/** The plate as the map itself decodes it, so this tests what gets drawn. */
const sea = (() => {
  const g = byRole(PLATE, 'sea')!.geometry
  if (g.type === 'Polygon') return [g.coordinates] as Ring[][]
  if (g.type === 'MultiPolygon') return g.coordinates as Ring[][]
  throw new Error(`the sea is ${g.type}, not an area`)
})()

const box = (w: number, s: number, e: number, n: number): Ring[][] => [
  [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
]

const KM2_PER_SQ_DEG = 111 * 111 * Math.cos((31.5 * Math.PI) / 180)
const areaKm2 = (polys: Ring[][]): number => {
  let total = 0
  for (const poly of polys) {
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r]!
      let sum = 0
      for (let i = 0; i < ring.length - 1; i++) {
        sum += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1]
      }
      total += (r === 0 ? 1 : -1) * Math.abs(sum / 2)
    }
  }
  return total * KM2_PER_SQ_DEG
}

const seaIn = (b: Ring[][]) => areaKm2(pc.intersection(sea, b) as Ring[][])

describe('the plate', () => {
  test('no sea inland along the Egyptian border', () => {
    expect(seaIn(box(34.3, 30.2, 34.95, 30.9))).toBeLessThan(1)
  })

  test('no sea inland along the Syrian border', () => {
    expect(seaIn(box(35.6, 32.9, 35.95, 33.3))).toBeLessThan(1)
  })

  // The other way this test could pass is an empty sea, which would be worse
  // than the bug.
  test('the Mediterranean is still there', () => {
    expect(seaIn(box(33.5, 31.6, 34.6, 33.0))).toBeGreaterThan(10_000)
  })
})
