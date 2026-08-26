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

type Role = 'sea' | 'neigh' | 'ps' | 'il' | 'desert' | 'forest' | 'urban' | 'water' | 'il-line'

/** Real relief under the plate. Esri World Hillshade: terrain only — no
 *  labels, no roads, nothing that could hint at an answer. */
const HILLSHADE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'
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
  desert: string
  forest: string
  urban: string
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
    desert: v('--map-desert', '#f0e8d4'),
    forest: v('--map-forest', '#d8e3d0'),
    urban: v('--map-urban', '#dddde1'),
    water: v('--map-water', '#b5d9fd'),
    border: v('--map-border', 'rgba(29,31,32,.42)'),
    borderStrong: v('--map-border-strong', '#1d1f20'),
    grid: v('--map-grid', 'rgba(29,31,32,.09)'),
    accent: v('--color-accent', '#5980a6'),
  }
}

/* Every fill is a translucent wash so the hillshade's relief reads through;
   the sea polygon shares its coastline with the land, so the seam is exact. */
function styleFor(t: Tokens) {
  return (feature?: { properties?: { role?: Role } }): L.PathOptions => {
    switch (feature?.properties?.role) {
      case 'sea':
        return { fillColor: t.sea, fillOpacity: 0.8, stroke: false }
      case 'il':
        return { fillColor: t.land, fillOpacity: 0.42, color: t.borderStrong, weight: 1.5 }
      case 'ps':
        return {
          fillColor: t.landAlt, fillOpacity: 0.5,
          color: t.borderStrong, weight: 1, dashArray: '5 4', opacity: 0.8,
        }
      case 'desert':
        return { fillColor: t.desert, fillOpacity: 0.5, stroke: false }
      case 'forest':
        return { fillColor: t.forest, fillOpacity: 0.55, stroke: false }
      case 'urban':
        return { fillColor: t.urban, fillOpacity: 0.65, stroke: false }
      case 'water':
        return { fillColor: t.water, fillOpacity: 0.95, stroke: false }
      case 'il-line':
        // The land washes cover the inner half of the border stroke, so the
        // border is re-drawn fill-less on top (last in the feature order).
        return { fill: false, color: t.borderStrong, weight: 1.5 }
      default:
        return { fillColor: t.neigh, fillOpacity: 0.65, color: t.border, weight: 1 }
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
  // Once the player has zoomed or panned, resize refits stop overriding them
  // (mobile browser chrome showing/hiding fires resizes constantly). A new
  // fitTo value takes the frame back.
  const userMovedRef = useRef(false)
  const fittingRef = useRef(false)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  const applyFit = (map: L.Map) => {
    // In jsdom (and before first layout) the container has no size and
    // fitBounds has nothing to solve against — the initial center/zoom stands.
    const size = map.getSize()
    if (size.x <= 0 || size.y <= 0) return
    fittingRef.current = true
    // The whole-country fit is the floor: you can zoom in from it, not out.
    map.setMinZoom(map.getBoundsZoom(ISRAEL_BOUNDS) - 0.2)
    map.fitBounds(fitRef.current, {
      // Extra bottom room keeps the southern tip clear of the readout bar.
      paddingTopLeft: [8, 8],
      paddingBottomRight: [8, 30],
      animate: false,
      maxZoom: 11,
    })
    fittingRef.current = false
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
      // The plate opens as a fixed survey chart, but a fingertip needs zoom:
      // Eilat is a 10 km wedge. Panning is confined to the chart itself.
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: false,
      keyboard: false,
      maxZoom: 13,
      maxBounds: ISRAEL_BOUNDS.pad(0.35),
      maxBoundsViscosity: 1,
    })
    applyFit(map)
    map.on('zoomstart movestart', () => {
      if (!fittingRef.current) userMovedRef.current = true
    })

    L.tileLayer(HILLSHADE, { maxZoom: 13 }).addTo(map)
    L.geoJSON(geo as never, { style: styleFor(t), interactive: false }).addTo(map)
    // The grid sits above the washes — the sea is a polygon now, and the hero
    // plate already draws its graticule over everything.
    for (const line of graticule(t)) line.addTo(map)

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
        if (!userMovedRef.current) applyFit(map)
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
    userMovedRef.current = false
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
