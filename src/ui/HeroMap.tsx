import geo from '../data/geo.json'

/* A static SVG plate for decorative use (the landing hero). Same geometry as
   MapView, no Leaflet: nothing here is interactive, so there is no reason to
   pay for a map instance. Mercator, hand-rolled in six lines. */

type Coord = [number, number]
type Ring = Coord[]
interface GeoFeature {
  properties: { role: 'neigh' | 'ps' | 'il' | 'water'; name: string }
  geometry:
    | { type: 'Polygon'; coordinates: Ring[] }
    | { type: 'MultiPolygon'; coordinates: Ring[][] }
}

const FEATURES = (geo as unknown as { features: GeoFeature[] }).features

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

const ringPath = (ring: Ring) =>
  ring
    .map((c, i) => {
      const [x, y] = project(c)
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join('') + 'Z'

const featurePath = (f: GeoFeature) =>
  f.geometry.type === 'Polygon'
    ? f.geometry.coordinates.map(ringPath).join('')
    : f.geometry.coordinates.map((poly) => poly.map(ringPath).join('')).join('')

const byRole = (role: GeoFeature['properties']['role']) =>
  FEATURES.filter((f) => f.properties.role === role)

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
      {byRole('neigh').map((f) => (
        <path key={f.properties.name} d={featurePath(f)} fill="var(--map-neigh)"
          stroke="var(--map-border)" strokeWidth="1.6" />
      ))}
      {byRole('ps').map((f) => (
        <path key={f.properties.name} d={featurePath(f)} fill="var(--map-land-alt)"
          stroke="var(--map-border-strong)" strokeWidth="1.6" strokeDasharray="8 6" opacity="0.85" />
      ))}
      {byRole('il').map((f) => (
        <path key={f.properties.name} d={featurePath(f)} fill="var(--map-land)"
          stroke="var(--map-border-strong)" strokeWidth="2.2" />
      ))}
      {byRole('water').map((f) => (
        <path key={f.properties.name} d={featurePath(f)} fill="var(--map-water)" />
      ))}
      {GRID.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="var(--map-grid)" strokeWidth="1.4" />
      ))}
    </svg>
  )
}
