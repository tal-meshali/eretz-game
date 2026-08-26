import { describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type * as L from 'leaflet'
import MapView from './MapView'

function mount(props: Parameters<typeof MapView>[0] = {}) {
  let map: L.Map | null = null
  const utils = render(<MapView {...props} onMapReady={(m) => (map = m)} />)
  return { map: map! as L.Map, ...utils }
}

function markersOf(map: L.Map): L.Layer[] {
  const found: L.Layer[] = []
  map.eachLayer((l) => {
    if ((l as L.CircleMarker).getRadius) found.push(l)
  })
  return found
}

describe('MapView', () => {
  test('initializes a leaflet map centered on Israel', () => {
    const { map } = mount()
    expect(map).toBeTruthy()
    const c = map.getCenter()
    expect(c.lat).toBeGreaterThan(29)
    expect(c.lat).toBeLessThan(34)
  })

  test('click fires onPick with latlng', () => {
    const onPick = vi.fn()
    const { map } = mount({ onPick })
    map.fire('click', { latlng: { lat: 32.1, lng: 34.9 } })
    expect(onPick).toHaveBeenCalledWith({ lat: 32.1, lng: 34.9 })
  })

  test('no onPick → clicks ignored', () => {
    const { map } = mount()
    expect(() => map.fire('click', { latlng: { lat: 32, lng: 35 } })).not.toThrow()
  })

  test('re-render with equal pin values keeps the same leaflet layers', () => {
    const pin = { lat: 32, lng: 34.8, label: 'אני', color: '#3388ff', kind: 'guess' as const }
    const { map, rerender } = mount({ pins: [pin] })
    const before = markersOf(map)
    expect(before).toHaveLength(1)
    // New array + new object, identical values — as produced by every clock-tick re-render
    rerender(<MapView pins={[{ ...pin }]} onMapReady={() => {}} />)
    const after = markersOf(map)
    expect(after).toHaveLength(1)
    expect(after[0]).toBe(before[0])
  })

  test('re-render with changed pin values rebuilds the layers', () => {
    const pin = { lat: 32, lng: 34.8, label: 'אני', color: '#3388ff', kind: 'guess' as const }
    const { map, rerender } = mount({ pins: [pin] })
    const before = markersOf(map)
    rerender(<MapView pins={[{ ...pin, lat: 31.2 }]} onMapReady={() => {}} />)
    const after = markersOf(map)
    expect(after).toHaveLength(1)
    expect(after[0]).not.toBe(before[0])
    expect((after[0] as L.CircleMarker).getLatLng().lat).toBeCloseTo(31.2, 5)
  })

  test('map container forces LTR so leaflet tooltip positioning math holds under the RTL page', () => {
    const { container } = mount()
    expect(container.querySelector('.map')).toHaveAttribute('dir', 'ltr')
  })

  test('renders a circle marker per pin', () => {
    const { map } = mount({
      pins: [
        { lat: 32, lng: 34.8, label: 'אני', color: '#3388ff', kind: 'guess' },
        { lat: 31.5, lng: 34.9, label: 'תשובה', color: '#2eb886', kind: 'answer' },
      ],
    })
    let count = 0
    map.eachLayer((l) => {
      if ((l as L.CircleMarker).getRadius) count++
    })
    expect(count).toBe(2)
  })
})
