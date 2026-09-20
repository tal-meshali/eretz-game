import { PLATE, type Role } from './mapPlate'

/* A static SVG plate for decorative use (the landing hero). Same geometry as
   MapView's plate, no Leaflet: nothing here is interactive, so there is no
   reason to pay for a map instance — and no reason to pay for the roadmap
   detail either, which MapView fetches separately. Mercator, hand-rolled in
   six lines. */

type Coord = [number, number]
type Ring = Coord[]

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/** Crop of the country used for the hero: coast, Kinneret and the Dead Sea. */
const BOX = { w: 34.15, e: 35.95, s: 31.05, n: 33.35 }
const WIDTH = 1000
const HEIGHT = Math.round(
  (WIDTH * (mercY(BOX.n) - mercY(BOX.s))) / ((BOX.e - BOX.w) * (Math.PI / 180)),
)

function project([lng, lat]: Coord): Coord {
  const x = ((lng - BOX.w) / (BOX.e - BOX.w)) * WIDTH
  const y = ((mercY(BOX.n) - mercY(lat)) / (mercY(BOX.n) - mercY(BOX.s))) * HEIGHT
  return [x, y]
}

/* The border is drawn to ~15 m, which is three thousand points the hero has no
   use for: one of its pixels is about 170 m. Vertices closer together than
   this once projected are dropped — the error is bounded by the threshold, and
   at 1.2 px on a backdrop behind a wordmark that is not a shape anyone reads. */
const MIN_PX = 1.2

/** Projected points with anything closer than the threshold dropped. */
function decimate(points: Ring): Coord[] {
  const out: Coord[] = []
  for (const coord of points) {
    const p = project(coord)
    const last = out[out.length - 1]
    if (last && Math.abs(p[0] - last[0]) < MIN_PX && Math.abs(p[1] - last[1]) < MIN_PX) continue
    out.push(p)
  }
  return out
}

const draw = (points: Coord[]) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

// A ring decimated below a triangle, or a line below a segment, is a shape too
// small for the hero to show.
const ringPath = (ring: Ring): string => {
  const points = decimate(ring)
  return points.length > 2 ? `${draw(points)}Z` : ''
}

const linePath = (line: Ring): string => {
  const points = decimate(line)
  return points.length > 1 ? draw(points) : ''
}

const pathOf = (geometry: unknown): string => {
  const g = geometry as { type: string; coordinates: Ring[] | Ring[][] }
  if (g.type === 'MultiLineString') return (g.coordinates as Ring[]).map(linePath).join('')
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][]
  return polys.map((poly) => poly.map(ringPath).join('')).join('')
}

/** One path per role: the plate ships each role as a single MultiPolygon, so
 *  the hero is six paths however many islands the geometry has. */
const PATHS = Object.fromEntries(
  PLATE.map((f) => [f.role, pathOf(f.geometry)]),
) as Record<Role, string | undefined>

const GRID: { x1: number; y1: number; x2: number; y2: number }[] = []
for (let lng = Math.ceil(BOX.w * 2) / 2; lng <= BOX.e; lng += 0.5) {
  const [x] = project([lng, BOX.n])
  GRID.push({ x1: x, y1: 0, x2: x, y2: HEIGHT })
}
for (let lat = Math.ceil(BOX.s * 2) / 2; lat <= BOX.n; lat += 0.5) {
  const [, y] = project([BOX.w, lat])
  GRID.push({ x1: 0, y1: y, x2: WIDTH, y2: y })
}

export default function HeroMap({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="var(--map-sea)" />
      <path d={PATHS.neigh} fill="var(--map-neigh)" />
      <path d={PATHS['neigh-line']} fill="none" stroke="var(--map-border)" strokeWidth="1.6" />
      <path d={PATHS.il} fill="var(--map-land)" />
      <path d={PATHS.ps} fill="var(--map-land-alt)" />
      <path d={PATHS.water} fill="var(--map-water)" />
      <path d={PATHS['road-trunk']} fill="none" stroke="var(--map-road-trunk)"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATHS['road-motorway']} fill="none" stroke="var(--map-road-motorway)"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATHS.ps} fill="none" stroke="var(--map-border-strong)"
        strokeWidth="1.6" strokeDasharray="8 6" opacity="0.85" />
      <path d={PATHS.il} fill="none" stroke="var(--map-border-strong)" strokeWidth="2.2" />
      {GRID.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="var(--map-grid)" strokeWidth="1.4" />
      ))}
    </svg>
  )
}
