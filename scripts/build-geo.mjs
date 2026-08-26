// Rebuilds src/data/geo.json — the territorial plate the map is drawn from.
//
//   node scripts/build-geo.mjs
//
// Sources (all public domain):
//   - Natural Earth 1:50m admin-0 via the world-atlas TopoJSON bundle:
//     sea, land, national borders.
//   - Natural Earth 1:10m urban areas (nightlights-derived): the grey
//     built-up patches. Note this layer has a size floor — Eilat, for one,
//     is under it — so it hints at the metros, not at most answers.
//
// Schematic geometry (NOT traced from a source):
//   - The Kinneret and the Dead Sea, as ellipses on their real centres at
//     their real N-S / E-W extents. The dataset ships no lake layer, and
//     without them an Israeli player has no landmark to navigate by.
//   - The desert wash: everything of Israel south of a hand-drawn line that
//     approximates the 200 mm rainfall boundary (Negev, Arava, Judean
//     desert rim), clipped to the real border.
//   - The forest patches: hand-placed ellipses over the big KKL/natural
//     blocks (Galilee, Carmel, Menashe, Jerusalem hills, Ben Shemen,
//     Yatir), clipped to the real border. Indicative, not cadastral.

import { writeFile } from 'node:fs/promises'
import { feature } from 'topojson-client'
import pc from 'polygon-clipping'

const SRC = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json'
// The 10m file blows jsdelivr's 20 MB cap, so it comes from raw.githubusercontent.
const SRC_URBAN =
  'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_urban_areas.json'
const OUT = new URL('../src/data/geo.json', import.meta.url)

// Regional window: rings with no vertex inside it are dropped, which is what
// keeps Egypt and Saudi Arabia from dragging their whole coastlines along.
const BBOX = { w: 31, e: 39, s: 26, n: 36 }
// Urban patches only matter where the plate is actually looked at.
const URBAN_BBOX = { w: 33.9, e: 36.6, s: 29.3, n: 33.5 }
const PRECISION = 3 // ~110 m, well under one screen pixel at this scale

const NEIGHBOURS = ['Egypt', 'Jordan', 'Lebanon', 'Syria', 'Saudi Arabia']
const WATER = [
  { name: 'Kinneret', lng: 35.593, lat: 32.816, nsKm: 21, ewKm: 13 },
  { name: 'Dead Sea', lng: 35.47, lat: 31.5, nsKm: 74, ewKm: 15 },
]

// Hand-drawn northern edge of the desert wash, west to east; the window is
// closed far to the south/east and intersected with the real border.
const DESERT_EDGE = [
  [33.8, 31.42], [34.55, 31.42], [34.85, 31.3], [35.05, 31.32],
  [35.25, 31.55], [35.4, 31.75], [35.6, 31.9],
]

// Forest blocks as (centre, N-S km, E-W km) ellipses.
const FORESTS = [
  { name: 'Upper Galilee', lng: 35.45, lat: 33.0, nsKm: 12, ewKm: 16 },
  { name: 'Western Galilee', lng: 35.15, lat: 33.02, nsKm: 8, ewKm: 10 },
  { name: 'Lower Galilee', lng: 35.35, lat: 32.75, nsKm: 10, ewKm: 14 },
  { name: 'Carmel', lng: 35.02, lat: 32.7, nsKm: 12, ewKm: 10 },
  { name: 'Menashe', lng: 35.15, lat: 32.55, nsKm: 10, ewKm: 14 },
  { name: 'Ben Shemen', lng: 34.98, lat: 31.95, nsKm: 8, ewKm: 10 },
  { name: 'Jerusalem hills', lng: 35.05, lat: 31.78, nsKm: 10, ewKm: 14 },
  { name: 'Yatir', lng: 35.05, lat: 31.35, nsKm: 9, ewKm: 14 },
]

const round = (v) => Number(v.toFixed(PRECISION))
const inBox = (box) => ([x, y]) => x >= box.w && x <= box.e && y >= box.s && y <= box.n

const toMulti = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

function fromMulti(polys) {
  const kept = polys.map((poly) => poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)])))
  if (kept.length === 0) return null
  return kept.length === 1
    ? { type: 'Polygon', coordinates: kept[0] }
    : { type: 'MultiPolygon', coordinates: kept }
}

function trim(geometry, box = BBOX) {
  return fromMulti(toMulti(geometry).filter((poly) => poly[0].some(inBox(box))))
}

function ellipseRing({ lng, lat, nsKm, ewKm }, steps = 52) {
  const a = nsKm / 2 / 111.32
  const b = ewKm / 2 / (111.32 * Math.cos((lat * Math.PI) / 180))
  const ring = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([round(lng + b * Math.sin(t)), round(lat + a * Math.cos(t))])
  }
  ring.push(ring[0])
  return ring
}

const ellipse = (spec) => ({ type: 'Polygon', coordinates: [ellipseRing(spec)] })

/** Intersection with the (already trimmed) Israel geometry, or null. */
const clipToIsrael = (geometry, israel) => {
  const hit = pc.intersection(toMulti(israel), toMulti(geometry))
  return hit.length ? fromMulti(hit) : null
}

const topology = await (await fetch(SRC)).json()
const countries = feature(topology, topology.objects.countries).features
const find = (name) => {
  const hit = countries.find((f) => f.properties.name === name)
  if (!hit) throw new Error(`country not found in source: ${name}`)
  return hit
}

const features = []
const push = (role, name, geometry) => {
  if (geometry) features.push({ type: 'Feature', properties: { role, name }, geometry })
}

for (const name of NEIGHBOURS) push('neigh', name, trim(find(name).geometry))
const ps = trim(find('Palestine').geometry)
const il = trim(find('Israel').geometry)
push('ps', 'Palestine', ps)
push('il', 'Israel', il)

// Desert wash: the edge polyline closed around everything to its south.
const desertWindow = {
  type: 'Polygon',
  coordinates: [[...DESERT_EDGE, [36.2, 31.9], [36.2, 29.0], [33.8, 29.0], DESERT_EDGE[0]]],
}
push('desert', 'Negev', clipToIsrael(desertWindow, il))
for (const f of FORESTS) push('forest', f.name, clipToIsrael(ellipse(f), il))

const urban = (await (await fetch(SRC_URBAN)).json()).features
for (const f of urban) {
  const geometry = trim(f.geometry, URBAN_BBOX)
  if (geometry) push('urban', 'urban', geometry)
}

for (const w of WATER) push('water', w.name, ellipse(w))

// The land washes above cover the inner half of Israel's border stroke, so a
// fill-less copy of the border is re-drawn on top of everything.
push('il-line', 'Israel', il)

const json = JSON.stringify({ type: 'FeatureCollection', features })
await writeFile(OUT, json)
console.log(`geo.json — ${features.length} features, ${(json.length / 1024).toFixed(1)} kB`)
