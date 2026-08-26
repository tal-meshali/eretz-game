import { describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type * as L from 'leaflet'
import MapView from './MapView'

function mount(props: Parameters<typeof MapView>[0] = {}) {
  let map: L.Map | null = null
  const utils = render(<MapView {...props} onMapReady={(m) => (map = m)} />)
  return { map: map! as L.Map, ...utils }
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
