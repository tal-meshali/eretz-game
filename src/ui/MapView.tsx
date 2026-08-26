import { useEffect, useRef } from 'react'
import L from 'leaflet'

export interface Pin {
  lat: number
  lng: number
  label: string
  color: string
  kind: 'guess' | 'answer'
}

export interface MapViewProps {
  pins?: Pin[]
  onPick?: (p: { lat: number; lng: number }) => void
  onMapReady?: (map: L.Map) => void
}

const ISRAEL_BOUNDS = L.latLngBounds([29.3, 33.8], [33.5, 36.2])
const TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export default function MapView({ pins = [], onPick, onMapReady }: MapViewProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    const map = L.map(elRef.current!, {
      center: [31.5, 35.0],
      zoom: 8,
      minZoom: 7,
      maxZoom: 13,
      maxBounds: ISRAEL_BOUNDS.pad(0.3),
      attributionControl: false,
      zoomControl: false,
    })
    L.tileLayer(TILES).addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    pinLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    onMapReady?.(map)
    return () => {
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const layer = pinLayerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const pin of pins) {
      L.circleMarker([pin.lat, pin.lng], {
        radius: pin.kind === 'answer' ? 12 : 8,
        color: '#fff',
        weight: 2,
        fillColor: pin.color,
        fillOpacity: 0.95,
      })
        .bindTooltip(pin.label, { permanent: true, direction: 'top', className: 'pin-tip' })
        .addTo(layer)
    }
  }, [pins])

  return <div ref={elRef} className="map" />
}
