import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import geo from '../data/geo.json'

export interface LatLng {
  lat: number
  lng: number
}

export interface Pin {
  lat: number
  lng: number
  label: string
  /** Ignored for `kind: 'answer'`, which always takes the accent token. */
  color?: string
  kind: 'guess' | 'answer'
}

export interface MapViewProps {
  pins?: Pin[]
  /** Distance rings in km, drawn around `ringsAt`. Radii are geodesic. */
  rings?: number[]
  ringsAt?: LatLng | null
  /** Dimension line between a guess and the answer, labelled in km. */
  link?: { from: LatLng; to: LatLng } | null
  /** Frame these points instead of the whole country (used by the reveal, so
   *  the rings and the player labels have room to be read). */
  fitTo?: LatLng[] | null
  onPick?: (p: LatLng) => void
  onMapReady?: (map: L.Map) => void
}

type Role = 'neigh' | 'ps' | 'il' | 'water'
interface GeoFeature {
  type: 'Feature'
  properties: { role: Role; name: string }
  geometry: unknown
}

const FEATURES = (geo as { features: GeoFeature[] }).features
const IL = FEATURES.find((f) => f.properties.role === 'il')!
// Fit is derived from the geometry itself, so retrimming geo.json reframes the plate.
const ISRAEL_BOUNDS = L.geoJSON(IL as never).getBounds()

interface Tokens {
  sea: string
  land: string
  landAlt: string
  neigh: string
  water: string
  border: string
  borderStrong: string
  grid: string
  accent: string
}

/* The plate takes its colors from the stylesheet's --map-* tokens, so the
   design system stays the single source of truth. Fallbacks keep jsdom happy. */
function readTokens(el: HTMLElement): Tokens {
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  const v = (name: string, fallback: string) =>
    (cs?.getPropertyValue(name) ?? '').trim() || fallback
  return {
    sea: v('--map-sea', '#d6ebff'),
    land: v('--map-land', '#f6f6f7'),
    landAlt: v('--map-land-alt', '#edeef0'),
    neigh: v('--map-neigh', '#e7e7ea'),
    water: v('--map-water', '#b5d9fd'),
    border: v('--map-border', 'rgba(29,31,32,.42)'),
    borderStrong: v('--map-border-strong', '#1d1f20'),
    grid: v('--map-grid', 'rgba(29,31,32,.09)'),
    accent: v('--color-accent', '#5980a6'),
  }
}

function styleFor(t: Tokens) {
  return (feature?: { properties?: { role?: Role } }): L.PathOptions => {
    switch (feature?.properties?.role) {
      case 'il':
        return { fillColor: t.land, fillOpacity: 1, color: t.borderStrong, weight: 1.5 }
      case 'ps':
        return {
          fillColor: t.landAlt, fillOpacity: 1,
          color: t.borderStrong, weight: 1, dashArray: '5 4', opacity: 0.8,
        }
      case 'water':
        return { fillColor: t.water, fillOpacity: 1, stroke: false }
      default:
        return { fillColor: t.neigh, fillOpacity: 1, color: t.border, weight: 1 }
    }
  }
}

/** Half-degree graticule — the survey grid the design is framed by. */
function graticule(t: Tokens): L.Polyline[] {
  const b = ISRAEL_BOUNDS.pad(0.35)
  const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast()
  const opts: L.PolylineOptions = { color: t.grid, weight: 1, interactive: false }
  const lines: L.Polyline[] = []
  const first = (v: number) => Math.ceil(v * 2) / 2
  for (let lng = first(w); lng <= e; lng += 0.5) {
    lines.push(L.polyline([[s, lng], [n, lng]], opts))
  }
  for (let lat = first(s); lat <= n; lat += 0.5) {
    lines.push(L.polyline([[lat, w], [lat, e]], opts))
  }
  return lines
}

const KM_PER_DEG_LAT = 111.32

export default function MapView({
  pins = [], rings, ringsAt = null, link = null, fitTo = null, onPick, onMapReady,
}: MapViewProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const tokensRef = useRef<Tokens | null>(null)
  const fitRef = useRef<L.LatLngBounds>(ISRAEL_BOUNDS)
  // Value signature of the overlay inputs: the app re-renders on a 4 Hz clock,
  // and rebuilding markers every tick would blow away Leaflet's DOM.
  const sigRef = useRef<string>('')
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  const applyFit = (map: L.Map) => {
    // In jsdom (and before first layout) the container has no size and
    // fitBounds has nothing to solve against — the initial center/zoom stands.
    const size = map.getSize()
    if (size.x <= 0 || size.y <= 0) return
    map.fitBounds(fitRef.current, { padding: [8, 8], animate: false, maxZoom: 11 })
  }

  useEffect(() => {
    const el = elRef.current!
    const t = readTokens(el)
    tokensRef.current = t

    const map = L.map(el, {
      center: [31.4, 35.0],
      zoom: 7,
      zoomSnap: 0,
      attributionControl: false,
      zoomControl: false,
      // The plate is a fixed survey chart: no panning, no zooming, so a guess
      // is always made at the same scale.
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    })
    applyFit(map)

    for (const line of graticule(t)) line.addTo(map)
    L.geoJSON(geo as never, { style: styleFor(t), interactive: false }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    overlayRef.current = L.layerGroup().addTo(map)
    // A fresh map has no overlay layers, whatever the signature said before a
    // remount (StrictMode re-runs this effect with props unchanged).
    sigRef.current = ''
    mapRef.current = map
    onMapReady?.(map)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        map.invalidateSize({ animate: false })
        applyFit(map)
      })
      ro.observe(el)
    }
    return () => {
      ro?.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    fitRef.current =
      fitTo && fitTo.length > 0
        ? L.latLngBounds(fitTo.map((p) => L.latLng(p.lat, p.lng))).pad(0.4)
        : ISRAEL_BOUNDS
    applyFit(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fitTo)])

  useEffect(() => {
    const layer = overlayRef.current
    const map = mapRef.current
    const t = tokensRef.current
    if (!layer || !map || !t) return

    const sig = JSON.stringify({ pins, rings, ringsAt, link })
    if (sig === sigRef.current) return
    sigRef.current = sig
    layer.clearLayers()

    if (rings && ringsAt) {
      for (const km of rings) {
        L.circle([ringsAt.lat, ringsAt.lng], {
          radius: km * 1000,
          fill: false,
          color: t.accent,
          weight: 0.9,
          dashArray: '2 4',
          opacity: 0.6,
          interactive: false,
        }).addTo(layer)
        L.marker([ringsAt.lat + km / KM_PER_DEG_LAT, ringsAt.lng], {
          icon: L.divIcon({
            className: 'ring-label', html: `${km}KM`, iconSize: [36, 12], iconAnchor: [18, 15],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(layer)
      }
    }

    if (link) {
      const from = L.latLng(link.from.lat, link.from.lng)
      const to = L.latLng(link.to.lat, link.to.lng)
      L.polyline([from, to], { color: t.accent, weight: 1.3, interactive: false }).addTo(layer)
      const km = map.distance(from, to) / 1000
      L.marker([(from.lat + to.lat) / 2, (from.lng + to.lng) / 2], {
        icon: L.divIcon({
          className: 'dim-label', html: `${km.toFixed(1)} KM`, iconSize: [58, 18], iconAnchor: [29, 34],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layer)
    }

    for (const pin of pins) {
      const isAnswer = pin.kind === 'answer'
      const marker = L.circleMarker([pin.lat, pin.lng], {
        radius: isAnswer ? 2.6 : 5.5,
        color: isAnswer ? t.accent : pin.color ?? t.accent,
        weight: isAnswer ? 1.4 : 1.6,
        fillColor: isAnswer ? t.accent : t.sea,
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer)
      // An empty label means "no tooltip": the reveal leaves the player's own
      // guess unlabelled because the dimension line already names it, which is
      // what keeps the cluster around the answer readable.
      if (pin.label) {
        marker.bindTooltip(pin.label, {
          permanent: true,
          direction: isAnswer ? 'bottom' : 'top',
          offset: isAnswer ? [0, 12] : [0, -8],
          className: 'pin-tip',
        })
      }
      if (isAnswer) {
        // Crosshair + ring drawn as an icon, not a second circleMarker, so the
        // answer reads as a survey target without doubling the marker count.
        L.marker([pin.lat, pin.lng], {
          icon: L.divIcon({ className: 'target', html: '<i></i>', iconSize: [32, 32], iconAnchor: [16, 16] }),
          interactive: false,
          keyboard: false,
        }).addTo(layer)
      }
    }
  }, [pins, rings, ringsAt, link])

  // Leaflet's positioning math assumes LTR; the page itself is RTL.
  return <div ref={elRef} className="map" dir="ltr" />
}
