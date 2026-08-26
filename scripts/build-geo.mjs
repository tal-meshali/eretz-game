// Rebuilds src/data/geo.json — the territorial plate the map is drawn from.
//
//   node scripts/build-geo.mjs
//
// Source: Natural Earth 1:50m admin-0 via the world-atlas TopoJSON bundle
// (public domain). Nothing about localities lives here: the map deliberately
// carries no settlement of any kind, so it can never hint at the answer.
//
// The Kinneret and the Dead Sea are emitted as schematic ellipses on their
// real centres at their real N-S / E-W extents. The dataset ships no lake
// layer, and without those two an Israeli player has no landmark to navigate
// by. They are the only geometry here that is not traced from the source.

import { writeFile } from 'node:fs/promises'
import { feature } from 'topojson-client'

const SRC = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json'
const OUT = new URL('../src/data/geo.json', import.meta.url)

// Regional window: rings with no vertex inside it are dropped, which is what
// keeps Egypt and Saudi Arabia from dragging their whole coastlines along.
const BBOX = { w: 31, e: 39, s: 26, n: 36 }
const PRECISION = 3 // ~110 m, well under one screen pixel at this scale

const NEIGHBOURS = ['Egypt', 'Jordan', 'Lebanon', 'Syria', 'Saudi Arabia']
const WATER = [
  { name: 'Kinneret', lng: 35.593, lat: 32.816, nsKm: 21, ewKm: 13 },
  { name: 'Dead Sea', lng: 35.47, lat: 31.5, nsKm: 74, ewKm: 15 },
]

const round = (v) => Number(v.toFixed(PRECISION))
const inBox = ([x, y]) => x >= BBOX.w && x <= BBOX.e && y >= BBOX.s && y <= BBOX.n

function trim(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const kept = polys
    .filter((poly) => poly[0].some(inBox))
    .map((poly) => poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)])))
  if (kept.length === 0) return null
  return kept.length === 1
    ? { type: 'Polygon', coordinates: kept[0] }
    : { type: 'MultiPolygon', coordinates: kept }
}

function ellipse({ lng, lat, nsKm, ewKm }, steps = 52) {
  const a = nsKm / 2 / 111.32
  const b = ewKm / 2 / (111.32 * Math.cos((lat * Math.PI) / 180))
  const ring = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([round(lng + b * Math.sin(t)), round(lat + a * Math.cos(t))])
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

const topology = await (await fetch(SRC)).json()
const countries = feature(topology, topology.objects.countries).features
const find = (name) => {
  const hit = countries.find((f) => f.properties.name === name)
  if (!hit) throw new Error(`country not found in source: ${name}`)
  return hit
}

const features = []
for (const name of NEIGHBOURS) {
  const geometry = trim(find(name).geometry)
  if (geometry) features.push({ type: 'Feature', properties: { role: 'neigh', name }, geometry })
}
for (const [name, role] of [['Palestine', 'ps'], ['Israel', 'il']]) {
  features.push({ type: 'Feature', properties: { role, name }, geometry: trim(find(name).geometry) })
}
for (const w of WATER) {
  features.push({ type: 'Feature', properties: { role: 'water', name: w.name }, geometry: ellipse(w) })
}

const json = JSON.stringify({ type: 'FeatureCollection', features })
await writeFile(OUT, json)
console.log(`geo.json — ${features.length} features, ${(json.length / 1024).toFixed(1)} kB`)
