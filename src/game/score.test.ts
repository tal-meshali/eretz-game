import { describe, expect, test } from 'vitest'
import { haversineKm, pointsFor } from './score'

const JERUSALEM = { lat: 31.7683, lng: 35.2137 }
const TEL_AVIV = { lat: 32.0853, lng: 34.7818 }

describe('haversineKm', () => {
  test('zero for identical points', () => {
    expect(haversineKm(JERUSALEM, JERUSALEM)).toBe(0)
  })
  test('Jerusalem to Tel Aviv is ~54 km', () => {
    const d = haversineKm(JERUSALEM, TEL_AVIV)
    expect(d).toBeGreaterThan(50)
    expect(d).toBeLessThan(58)
  })
  test('symmetric', () => {
    expect(haversineKm(JERUSALEM, TEL_AVIV)).toBeCloseTo(haversineKm(TEL_AVIV, JERUSALEM), 10)
  })
})

describe('pointsFor', () => {
  test('bullseye gives 1000', () => {
    expect(pointsFor(0)).toBe(1000)
  })
  test('30 km gives ~368', () => {
    expect(pointsFor(30)).toBe(368)
  })
  test('monotonically decreasing', () => {
    expect(pointsFor(10)).toBeGreaterThan(pointsFor(11))
  })
  test('far guesses approach 0', () => {
    expect(pointsFor(300)).toBe(0)
  })
})
