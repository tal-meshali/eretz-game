/* The cartography: which roles exist, what each is drawn with, and at which
   zoom it earns its place. MapView owns the Leaflet instance and its
   lifecycle; this file owns what that instance looks like, so the plate can
   be retuned without going near either. HeroMap reads the same plate. */

import type * as LT from 'leaflet'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, Geometry } from 'geojson'
import plateTopo from '../data/geo-plate.json'

export type PlateRole =
  | 'sea' | 'neigh' | 'neigh-line' | 'il' | 'ps' | 'water' | 'road-trunk' | 'road-motorway'
export type DetailRole =
  | 'builtup' | 'wood' | 'water-minor' | 'river' | 'road-secondary' | 'road-primary'
export type Role = PlateRole | DetailRole

export type RoleFeature = Feature<Geometry> & { role: Role }

/** The roadmap detail, fetched rather than bundled: it is an order of
 *  magnitude bigger than the plate, and the landing page — which draws the
 *  plate as a hero — must not pay for roads it never shows. */
export const DETAIL_URL = `${import.meta.env.BASE_URL}geo-detail.json`

/** TopoJSON, not GeoJSON: the two borders alone are ~27k vertices, affordable
 *  only quantized and delta-encoded. Quantizing every layer onto one shared
 *  grid is also what stops a road and the border beside it from disagreeing
 *  by half a metre. */
export function decode(topo: unknown): RoleFeature[] {
  const t = topo as Topology
  return Object.keys(t.objects).flatMap((role) => {
    // Each object went into topojson-server as a single Feature, so this comes
    // back as one — but a collection decodes just as happily, and not
    // depending on which leaves the build script free to split a role.
    const decoded = feature(t, t.objects[role] as GeometryCollection)
    const list = decoded.type === 'FeatureCollection' ? decoded.features : [decoded]
    return list.map((f) => Object.assign(f as Feature<Geometry>, { role: role as Role }))
  })
}

export const PLATE = decode(plateTopo)

export const byRole = (features: RoleFeature[], role: Role): RoleFeature | undefined =>
  features.find((f) => f.role === role)

/* ── the palette ───────────────────────────────────────────────────────────
   Token names mirror the roles. MapView reads them off the live container, so
   styles.css stays the one place the plate is coloured; the defaults here are
   only what jsdom (which computes no custom properties) falls back to. */

export interface Tokens {
  sea: string
  land: string
  landAlt: string
  neigh: string
  water: string
  builtup: string
  wood: string
  river: string
  motorway: string
  trunk: string
  primary: string
  secondary: string
  casing: string
  border: string
  borderStrong: string
  grid: string
  accent: string
}

const TOKENS: Record<keyof Tokens, [cssVar: string, fallback: string]> = {
  sea: ['--map-sea', '#cbe3f7'],
  land: ['--map-land', '#f8f3e8'],
  landAlt: ['--map-land-alt', '#efe9dc'],
  neigh: ['--map-neigh', '#e3e1dd'],
  water: ['--map-water', '#a3cbec'],
  builtup: ['--map-builtup', '#d6c7ae'],
  wood: ['--map-wood', '#aec78f'],
  river: ['--map-river', '#8fb9dd'],
  motorway: ['--map-road-motorway', '#a8462a'],
  trunk: ['--map-road-trunk', '#c96f3b'],
  primary: ['--map-road-primary', '#e0a552'],
  secondary: ['--map-road-secondary', '#ab9f89'],
  casing: ['--map-road-casing', 'rgba(255,255,255,.85)'],
  border: ['--map-border', 'rgba(29,31,32,.35)'],
  borderStrong: ['--map-border-strong', '#1d1f20'],
  grid: ['--map-grid', 'rgba(29,31,32,.09)'],
  accent: ['--color-accent', '#5980a6'],
}

export function readTokens(el: HTMLElement): Tokens {
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  const out = {} as Tokens
  for (const key of Object.keys(TOKENS) as (keyof Tokens)[]) {
    const [cssVar, fallback] = TOKENS[key]
    out[key] = (cs?.getPropertyValue(cssVar) ?? '').trim() || fallback
  }
  return out
}

/* ── what each role is drawn with ──────────────────────────────────────────
   `minZoom` is the roadmap's own convention rather than a performance dodge:
   a sheet of the whole country that drew every secondary road would be a grey
   haze, and the same sheet at 1:100,000 would be missing half its network.
   The country fits at about z8 and the plate stops at z13. */

export interface Spec {
  role: Role
  style: (t: Tokens) => LT.PathOptions
  /** A wider pass drawn under the line — what makes a road read as a road
   *  where it crosses another one. */
  casing?: (t: Tokens) => LT.PathOptions
  minZoom?: number
}

const CAP: LT.PathOptions = { lineCap: 'round', lineJoin: 'round' }

const road = (
  role: Role, colour: (t: Tokens) => string, weight: number, minZoom?: number,
): Spec => ({
  role,
  minZoom,
  style: (t) => ({ ...CAP, color: colour(t), weight }),
  // Only the classes heavy enough to carry one: a casing under a 0.6px line
  // is a smudge.
  casing: weight >= 1 ? (t) => ({ ...CAP, color: t.casing, weight: weight + 0.9 }) : undefined,
})

/** Draw order, bottom first. */
export const PLATE_SPECS: Spec[] = [
  { role: 'sea', style: (t) => ({ fillColor: t.sea, fillOpacity: 0.85, stroke: false }) },
  // Ground and outline are separate roles because they are not the same
  // shape: the ground runs right up to our border, the outline stops short of
  // it. See the build script — Natural Earth's version of our border is
  // kilometres out, so it is ground to lay the real one over, never a line.
  { role: 'neigh', style: (t) => ({ fillColor: t.neigh, fillOpacity: 0.8, stroke: false }) },
  { role: 'neigh-line', style: (t) => ({ color: t.border, weight: 1 }) },
  { role: 'il', style: (t) => ({ fillColor: t.land, fillOpacity: 0.62, stroke: false }) },
  { role: 'ps', style: (t) => ({ fillColor: t.landAlt, fillOpacity: 0.68, stroke: false }) },
]

/** Between the land and the roadmap: woodland and built-up areas sit under the
 *  network, the big lakes over it — a road never crosses the Kinneret. */
export const DETAIL_SPECS: Spec[] = [
  { role: 'wood', style: (t) => ({ fillColor: t.wood, fillOpacity: 0.8, stroke: false }) },
  { role: 'builtup', style: (t) => ({ fillColor: t.builtup, fillOpacity: 0.92, stroke: false }) },
  { role: 'water-minor', minZoom: 9, style: (t) => ({ fillColor: t.water, fillOpacity: 0.92, stroke: false }) },
  { role: 'river', minZoom: 9, style: (t) => ({ color: t.river, weight: 1, opacity: 0.85 }) },
  road('road-secondary', (t) => t.secondary, 0.6, 10),
  road('road-primary', (t) => t.primary, 1, 8.6),
]

/** The arterial network, the lakes and the two borders, over everything. The
 *  motorways are plate geometry drawn at the top of the stack so the roadmap
 *  detail — which arrives later and underneath — cannot bury them; the
 *  borders are re-drawn fill-less because every wash above the land covers
 *  the inner half of their stroke. */
export const OVERLAY_SPECS: Spec[] = [
  road('road-trunk', (t) => t.trunk, 1.1),
  road('road-motorway', (t) => t.motorway, 1.6),
  { role: 'water', style: (t) => ({ fillColor: t.water, fillOpacity: 0.97, stroke: false }) },
  {
    role: 'ps',
    style: (t) => ({ fill: false, color: t.borderStrong, weight: 1, dashArray: '5 4', opacity: 0.75 }),
  },
  { role: 'il', style: (t) => ({ fill: false, color: t.borderStrong, weight: 1.5 }) },
]
