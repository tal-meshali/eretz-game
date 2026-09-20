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

/* The same disagreement, drawn instead of filled. The neighbours' ground runs
   right up to our border; their OUTLINE must not, because Natural Earth's idea
   of where that border is lands kilometres away from geoBoundaries' and the
   map would carry two borders, one of them wrong. What is left is the
   neighbours' own business — Jordan with Saudi Arabia, Egypt with Jordan,
   Lebanon with Syria — and those run TO our border and end on it. */
describe('the neighbours\' outline', () => {
  const border = [byRole(PLATE, 'il')!, byRole(PLATE, 'ps')!].flatMap((f) => {
    const g = f.geometry
    if (g.type !== 'MultiPolygon') throw new Error(`${f.role} is ${g.type}, not an area`)
    return (g.coordinates as Ring[][]).flat(2)
  })

  const lines = (() => {
    const g = byRole(PLATE, 'neigh-line')!.geometry
    if (g.type === 'LineString') return [g.coordinates] as Ring[]
    if (g.type === 'MultiLineString') return g.coordinates as Ring[]
    throw new Error(`the outline is ${g.type}, not a line`)
  })()

  const closed = (line: Ring) =>
    line[0]![0] === line[line.length - 1]![0] && line[0]![1] === line[line.length - 1]![1]

  /** Distance to the nearest border vertex in km, off a grid of them. */
  const CELL = 0.06
  const KX = 111.32 * Math.cos((31.5 * Math.PI) / 180)
  const grid = new Map<string, [number, number][]>()
  for (const [x, y] of border) {
    const k = `${Math.floor(x! / CELL)},${Math.floor(y! / CELL)}`
    const bucket = grid.get(k)
    if (bucket) bucket.push([x!, y!])
    else grid.set(k, [[x!, y!]])
  }
  const distKm = ([x, y]: number[]) => {
    let best = Infinity
    const cx = Math.floor(x! / CELL)
    const cy = Math.floor(y! / CELL)
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        for (const [bx, by] of grid.get(`${cx + i},${cy + j}`) ?? []) {
          best = Math.min(best, Math.hypot((x! - bx) * KX, (y! - by) * 111.32))
        }
      }
    }
    return best
  }

  test('never runs alongside our own border', () => {
    // Only the last few vertices of a line may come near our border — that is
    // it arriving. Anything nearby further in is a second border being drawn.
    const alongside: string[] = []
    for (const line of lines) {
      for (const [i, point] of line.entries()) {
        const fromEnd = Math.min(i, line.length - 1 - i)
        if (fromEnd > 4 && distKm(point) < 5) alongside.push(`${point} at ${i}/${line.length}`)
      }
    }
    expect(alongside).toEqual([])
  })

  test('no line is left dangling', () => {
    // An end is either on our border — where these borders really end — or it
    // is another line's end, which is how Lebanon and Syria meet on Hermon.
    const ends = lines.filter((l) => !closed(l)).flatMap((l) => [l[0]!, l[l.length - 1]!])
    const loose = ends.filter((end, i) => {
      if (distKm(end) < 0.05) return false
      return !ends.some((o, j) => j !== i && o[0] === end[0] && o[1] === end[1])
    })
    expect(loose).toEqual([])
  })

  // The other way those could pass is an empty outline, which would take
  // Jordan's border with Saudi Arabia and Lebanon's with Syria with it.
  test('the neighbours still have borders of their own', () => {
    expect(lines.flat().length).toBeGreaterThan(1_000)
    expect(lines.filter((l) => !closed(l)).length).toBeGreaterThan(2)
  })
})
