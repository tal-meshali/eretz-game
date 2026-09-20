// Rebuilds the two geometry files the map is drawn from.
//
//   node scripts/build-geo.mjs          # uses .geo-cache/ when it is warm
//   node scripts/build-geo.mjs --fresh  # re-downloads every source
//
// Output is TopoJSON, not GeoJSON, for two reasons beyond size: quantization
// snaps every layer to one shared grid, so a road and the border it runs
// beside cannot disagree by half a metre; and arc extraction stores a line
// shared by two polygons once, which is what keeps the Israel/West Bank seam
// from showing a sliver.
//
//   src/data/geo-plate.json   the territorial plate — sea, neighbours, the two
//                             exact borders, the big water bodies. Small
//                             enough to bundle; HeroMap draws it too.
//   public/geo-detail.json    the roadmap itself — roads by class, built-up
//                             areas, woodland, minor water, rivers. Fetched at
//                             runtime by MapView, so the landing page and the
//                             first paint of the map never pay for it.
//
// Sources, all open data:
//   - geoBoundaries gbOpen ISR/PSE ADM0 (ODbL, OSM-derived) — the exact
//     national borders. Natural Earth's 1:10m outline, which this file used
//     to draw, is ~420 vertices for the whole country: the Green Line came out
//     as a handful of straight runs and the Gaza boundary barely existed.
//   - Natural Earth 1:10m admin-0 — the neighbours ONLY. They are flat grey
//     context; the line that matters between them and us is Israel's own.
//   - OpenStreetMap via Overpass (ODbL) — roads, built-up areas, woodland,
//     water. Nothing carries a name into the output: a label on this map
//     would hand the player the answer.
//
// Deliberately NOT here any more: the hand-drawn "desert wash" and the eight
// hand-placed forest ellipses. Both were schematic geometry pretending to be
// surveyed, and with real woodland and real built-up areas the Negev reads as
// empty because it IS empty, which is what an Israeli roadmap shows.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import pc from 'polygon-clipping'
import { topology } from 'topojson-server'
import {
  fromMulti, insideTester, joinLines, ringAreaKm2, roundTo, simplifyLine, simplifyRing, toMulti,
} from './geo-lib.mjs'

const FRESH = process.argv.includes('--fresh')
const CACHE = new URL('../.geo-cache/', import.meta.url)
const OUT_PLATE = new URL('../src/data/geo-plate.json', import.meta.url)
const OUT_DETAIL = new URL('../public/geo-detail.json', import.meta.url)

// Overpass rejects a request with no User-Agent, and the main endpoint is
// busy often enough that one mirror is not a plan.
const UA = 'eretz-game-geo-build/1.0 (https://github.com/eretz-game)'
const OVERPASS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const NE = 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m'
const GB = (iso) => `https://www.geoboundaries.org/api/current/gbOpen/${iso}/ADM0/`

// The query window. Wider than the country so a road does not stop at the
// frame; everything is clipped to the border further down.
const BOX = { s: 29.4, w: 34.2, n: 33.45, e: 35.95 }
const OVERPASS_BOX = `${BOX.s},${BOX.w},${BOX.n},${BOX.e}`
// The neighbours' window is the old regional one: it is what makes the map
// read as a country among countries rather than a cut-out.
const REGION = { s: 26, w: 31, n: 36, e: 39 }

const PRECISION = 5 // ~1 m; quantization is what actually sets the resolution

/* ---------- sources ---------- */

await mkdir(CACHE, { recursive: true })

async function cached(name, load) {
  const file = new URL(`${name}.json`, CACHE)
  if (!FRESH && existsSync(file)) return JSON.parse(await readFile(file, 'utf8'))
  process.stdout.write(`  fetching ${name}… `)
  const data = await load()
  await writeFile(file, JSON.stringify(data))
  console.log('ok')
  return data
}

const getJson = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function overpass(query) {
  let last
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
      })
      const text = await res.text()
      // A busy Overpass answers 200 with an HTML error page, so the status line
      // is not the check — the body is.
      if (res.ok && text.startsWith('{')) return JSON.parse(text)
      last = `${endpoint}: ${res.status} ${text.slice(0, 160)}`
    } catch (err) {
      // A timeout or a dropped connection is the commonest way these mirrors
      // fail; it has to move to the next one rather than end the build.
      last = `${endpoint}: ${err.message}`
    }
  }
  throw new Error(`every overpass endpoint refused — ${last}`)
}

// Every statement inside the union needs its own terminator; the callers below
// read better without trailing semicolons, so this adds the one that matters.
const osm = (name, query) =>
  cached(name, () => overpass(`[out:json][timeout:280];(${query.replace(/;?\s*$/, '')};);out geom;`))

const geoBoundary = (iso) =>
  cached(`border-${iso.toLowerCase()}`, async () => getJson((await getJson(GB(iso))).gjDownloadURL))

/* ---------- OSM element → geometry ----------
   `out geom` hands back member ways, not rings: a multipolygon relation has to
   be stitched back together by matching endpoints. An unclosed leftover is
   dropped rather than force-closed — a half-traced lake is worse than none. */

const key = ([x, y]) => `${x},${y}`
const ringsFrom = (ways) => {
  const open = ways.map((w) => w.map(({ lat, lon }) => [lon, lat])).filter((w) => w.length > 1)
  const rings = []
  while (open.length) {
    let line = open.pop()
    let joined = true
    while (joined && key(line[0]) !== key(line[line.length - 1])) {
      joined = false
      for (let i = 0; i < open.length; i++) {
        const other = open[i]
        const head = key(line[0])
        const tail = key(line[line.length - 1])
        if (key(other[0]) === tail) line = line.concat(other.slice(1))
        else if (key(other[other.length - 1]) === tail) line = line.concat(other.slice(0, -1).reverse())
        else if (key(other[other.length - 1]) === head) line = other.slice(0, -1).concat(line)
        else if (key(other[0]) === head) line = other.slice(1).reverse().concat(line)
        else continue
        open.splice(i, 1)
        joined = true
        break
      }
    }
    if (line.length > 3 && key(line[0]) === key(line[line.length - 1])) rings.push(line)
  }
  return rings
}

/** Polygons from one OSM element: a closed way, or a stitched relation. */
function polygonsOf(el) {
  if (el.type === 'way') {
    const ring = (el.geometry ?? []).map(({ lat, lon }) => [lon, lat])
    if (ring.length < 4 || key(ring[0]) !== key(ring[ring.length - 1])) return []
    return [[ring]]
  }
  const members = el.members ?? []
  const outers = ringsFrom(members.filter((m) => m.role !== 'inner' && m.geometry).map((m) => m.geometry))
  const inners = ringsFrom(members.filter((m) => m.role === 'inner' && m.geometry).map((m) => m.geometry))
  if (!outers.length) return []
  // Holes are dropped: at this scale an island inside a reservoir is a pixel,
  // and keeping them would mean solving containment for every inner ring.
  void inners
  return outers.map((ring) => [ring])
}

const lineOf = (el) => (el.geometry ?? []).map(({ lat, lon }) => [lon, lat])

/* ---------- the border ---------- */

console.log('borders…')
const isr = await geoBoundary('ISR')
const pse = await geoBoundary('PSE')

// geoBoundaries ships a handful of sub-hectare slivers on the Palestine
// outline — digitizing noise, four vertices each, invisible and not free.
const MIN_BORDER_KM2 = 1
const borderPolys = (fc) =>
  fc.features
    .flatMap((f) => toMulti(f.geometry))
    .filter((poly) => Math.abs(ringAreaKm2(poly[0])) >= MIN_BORDER_KM2)

const BORDER_M = 15 // the line Tal called inexact; this is ~1 px at max zoom
const simplifyPolys = (polys, metres, minKm2 = 0) =>
  polys
    .map((poly) => poly.map((ring) => simplifyRing(ring, metres)))
    .filter((poly) => Math.abs(ringAreaKm2(poly[0])) >= minKm2)

const ilPolys = simplifyPolys(borderPolys(isr), BORDER_M)
const psPolys = simplifyPolys(borderPolys(pse), BORDER_M)
const il = fromMulti(ilPolys)
const ps = fromMulti(psPolys)

// One test for "is this in the country", shared by every layer below.
const inCountry = insideTester([...ilPolys, ...psPolys])

/* ---------- the neighbours and the sea ---------- */

const neighbours = await cached('neighbours', async () => {
  const fc = await getJson(`${NE}/cultural/ne_10m_admin_0_countries.json`)
  const want = ['Egypt', 'Jordan', 'Lebanon', 'Syria', 'Saudi Arabia']
  return want.map((name) => {
    const hit = fc.features.find((f) => (f.properties.NAME ?? f.properties.ADMIN) === name)
    if (!hit) throw new Error(`country not found in source: ${name}`)
    return { name, geometry: hit.geometry }
  })
})

const inRegion = ([x, y]) => x >= REGION.w && x <= REGION.e && y >= REGION.s && y <= REGION.n
const neighbourPolys = neighbours.flatMap((c) =>
  simplifyPolys(toMulti(c.geometry).filter((poly) => poly[0].some(inRegion)), 400),
)

/* The two halves of every land border come from different surveys: Israel and
   the West Bank from geoBoundaries at ~15 m, the neighbours from Natural
   Earth 1:10m. They disagree by a median of 2.1 km along the Egyptian border
   (4.8 km at worst) — not a simplification artifact, the sources simply draw
   the line in different places. Nothing covers the disputed ground, so the
   sea, which was "the window minus every landmass", claimed it and painted a
   blue band down the Egyptian and Syrian borders.

   Natural Earth also carries Israel and Palestine, and its own coverage is
   watertight: what Egypt does not claim there, NE's Israel does. Those two
   polygons fill the gaps and nothing else — they are never drawn as borders,
   only as flat neighbour-grey ground under the real ones. */
const nePlate = await cached('ne-plate-land', async () => {
  const fc = await getJson(`${NE}/cultural/ne_10m_admin_0_countries.json`)
  return ['Israel', 'Palestine'].map((name) => {
    const hit = fc.features.find((f) => (f.properties.NAME ?? f.properties.ADMIN) === name)
    if (!hit) throw new Error(`country not found in source: ${name}`)
    return { name, geometry: hit.geometry }
  })
})

const nePlatePolys = nePlate.flatMap((c) =>
  simplifyPolys(toMulti(c.geometry).filter((poly) => poly[0].some(inRegion)), 400),
)

const rect = [[[
  [REGION.w, REGION.s], [REGION.e, REGION.s], [REGION.e, REGION.n],
  [REGION.w, REGION.n], [REGION.w, REGION.s],
]]]

/* Only the inland gaps. NE's coastline runs up to 1.4 km out to sea from
   geoBoundaries', and that stretch must stay water: today's coast is the
   drawn country's own edge and has nothing wrong with it. A gap that touches
   a neighbour is a border gap; one that touches only sea is coastal slop. */
const NEAR_M = 60
const nearNeighbour = insideTester(neighbourPolys)
const touchesNeighbour = (poly) => {
  const d = NEAR_M / (111_320 * Math.cos((31.5 * Math.PI) / 180))
  return poly[0].some(([x, y]) =>
    nearNeighbour(x + d, y) || nearNeighbour(x - d, y) ||
    nearNeighbour(x, y + d) || nearNeighbour(x, y - d),
  )
}
const borderFill = pc
  .difference(nePlatePolys, [...neighbourPolys, ...ilPolys, ...psPolys])
  .filter(touchesNeighbour)

// The sea is the window minus every landmass, so its coast IS the land's —
// there is no second coastline to disagree with the first.
const sea = fromMulti(pc.difference(rect, [
  ...neighbourPolys, ...ilPolys, ...psPolys, ...borderFill,
]))

/* ---------- the roadmap layers ---------- */

console.log('openstreetmap…')

const ROAD_CLASSES = {
  motorway: ['motorway', 'motorway_link'],
  trunk: ['trunk'],
  primary: ['primary'],
  secondary: ['secondary'],
}
const roadSource = await osm(
  'roads',
  `way["highway"~"^(motorway|motorway_link|trunk|primary|secondary)$"](${OVERPASS_BOX})`,
)
const builtupSource = await osm(
  'builtup',
  `way["landuse"~"^(residential|industrial|commercial|retail)$"](${OVERPASS_BOX});` +
    `relation["landuse"~"^(residential|industrial|commercial|retail)$"](${OVERPASS_BOX})`,
)
const woodSource = await osm(
  'wood',
  `way["landuse"="forest"](${OVERPASS_BOX});way["natural"="wood"](${OVERPASS_BOX});` +
    `relation["landuse"="forest"](${OVERPASS_BOX});relation["natural"="wood"](${OVERPASS_BOX})`,
)
const waterSource = await osm(
  'water',
  `way["natural"="water"](${OVERPASS_BOX});relation["natural"="water"](${OVERPASS_BOX})`,
)
// Rivers only, not every named wadi: the Jordan and the Yarkon are landmarks
// a player navigates by, and a few thousand seasonal streams are texture.
const riverSource = await osm('rivers', `way["waterway"="river"](${OVERPASS_BOX})`)

/** Maximal runs of in-country vertices, each carrying one vertex past the
 *  border so a road meets the line instead of stopping short of it. */
function clipLine(points) {
  const out = []
  let run = null
  for (let i = 0; i < points.length; i++) {
    const inside = inCountry(points[i][0], points[i][1])
    if (inside) {
      if (!run) {
        run = []
        if (i > 0) run.push(points[i - 1])
      }
      run.push(points[i])
    } else if (run) {
      run.push(points[i])
      out.push(run)
      run = null
    }
  }
  if (run) out.push(run)
  return out.filter((r) => r.length > 1)
}

/** A polygon is kept whole when any vertex is in the country — the Dead Sea
 *  straddles the Jordanian border and a roadmap draws all of it. */
const touchesCountry = (poly) => poly[0].some(([x, y]) => inCountry(x, y))

function polygonLayer(source, { metres, minKm2 }) {
  const polys = []
  for (const el of source.elements ?? []) {
    for (const poly of polygonsOf(el)) {
      if (!touchesCountry(poly)) continue
      const simplified = poly.map((ring) => simplifyRing(ring, metres))
      if (Math.abs(ringAreaKm2(simplified[0])) < minKm2) continue
      polys.push(simplified)
    }
  }
  return polys
}

// Join first, then clip, then simplify: joining needs the untouched OSM node
// coordinates to recognise a shared endpoint, and simplifying a long joined
// line drops far more vertices than simplifying its pieces one at a time.
const ROAD_METRES = { motorway: 25, trunk: 25, primary: 30, secondary: 45 }
const roads = {}
for (const cls of Object.keys(ROAD_CLASSES)) {
  const raw = (roadSource.elements ?? [])
    .filter((el) => ROAD_CLASSES[cls].includes(el.tags?.highway))
    .map(lineOf)
  roads[cls] = joinLines(raw)
    .flatMap(clipLine)
    .map((run) => simplifyLine(run, ROAD_METRES[cls]))
    .filter((line) => line.length > 1)
}

const builtup = polygonLayer(builtupSource, { metres: 45, minKm2: 0.03 })
const wood = polygonLayer(woodSource, { metres: 60, minKm2: 0.08 })
const allWater = polygonLayer(waterSource, { metres: 25, minKm2: 0.03 })
// The Kinneret and the Dead Sea carry the plate: you can place half the
// country off those two shapes, so they ship with it rather than arriving
// late with the roadmap detail.
const MAJOR_WATER_KM2 = 25
const majorWater = allWater.filter((p) => Math.abs(ringAreaKm2(p[0])) >= MAJOR_WATER_KM2)
const minorWater = allWater.filter((p) => Math.abs(ringAreaKm2(p[0])) < MAJOR_WATER_KM2)

const rivers = joinLines((riverSource.elements ?? []).map(lineOf))
  .flatMap(clipLine)
  .map((run) => simplifyLine(run, 45))
  .filter((line) => line.length > 1)

/* ---------- emit ---------- */

const round = (coords) =>
  Array.isArray(coords[0]) ? coords.map(round) : [roundTo(coords[0], PRECISION), roundTo(coords[1], PRECISION)]

const multiPolygon = (polys) =>
  polys.length ? { type: 'MultiPolygon', coordinates: round(polys) } : null
const multiLine = (lines) =>
  lines.length ? { type: 'MultiLineString', coordinates: round(lines) } : null

const collection = (entries) => ({
  type: 'FeatureCollection',
  features: entries
    .filter(([, geometry]) => geometry)
    .map(([role, geometry]) => ({ type: 'Feature', properties: { role }, geometry })),
})

// 1e5 over a 1.75° x 4° window is ~1.6 m east-west and ~4.4 m north-south —
// under the 15 m the border itself was simplified to, so quantization is not
// what limits the shape of anything here.
const QUANTIZE = 1e5

// The arterial network ships WITH the plate, not with the roadmap detail.
// Motorways and trunk roads are a tenth of the road vertices and most of what
// makes the sheet legible: they give the map its highways on first paint
// instead of after a 1.5 MB fetch, and they are what the landing hero — which
// draws the plate and nothing else — has to look at.
const plate = collection([
  ['sea', sea && { type: sea.type, coordinates: round(sea.coordinates) }],
  // The gap fill rides with the neighbours: it is the same flat grey ground,
  // and it sits under Israel's own border wherever the two surveys differ.
  ['neigh', multiPolygon([...neighbourPolys, ...borderFill])],
  ['il', { type: 'MultiPolygon', coordinates: round(ilPolys) }],
  ['ps', { type: 'MultiPolygon', coordinates: round(psPolys) }],
  ['water', multiPolygon(majorWater)],
  ['road-trunk', multiLine(roads.trunk)],
  ['road-motorway', multiLine(roads.motorway)],
])

const detail = collection([
  ['builtup', multiPolygon(builtup)],
  ['wood', multiPolygon(wood)],
  ['water-minor', multiPolygon(minorWater)],
  ['river', multiLine(rivers)],
  ['road-secondary', multiLine(roads.secondary)],
  ['road-primary', multiLine(roads.primary)],
])

const byRole = (fc) => Object.fromEntries(fc.features.map((f) => [f.properties.role, f]))

const write = async (out, fc, label) => {
  const topo = topology(byRole(fc), QUANTIZE)
  const json = JSON.stringify(topo)
  await writeFile(out, json)
  const counts = fc.features
    .map((f) => `${f.properties.role}:${f.geometry.coordinates.flat(2).length / 2 | 0}`)
    .join(' ')
  console.log(`${label} — ${(json.length / 1024).toFixed(0)} kB · ${counts}`)
}

await mkdir(new URL('../public/', import.meta.url), { recursive: true })
await write(OUT_PLATE, plate, 'geo-plate.json')
await write(OUT_DETAIL, detail, 'geo-detail.json')
