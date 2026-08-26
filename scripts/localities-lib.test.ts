import { describe, expect, test } from 'vitest'
import { itmToWgs84, parsePackedCoord, recordsToLocalities } from './localities-lib.mjs'

describe('parsePackedCoord', () => {
  test('splits 12-digit packed ITM into east/north', () => {
    expect(parsePackedCoord(174014614251)).toEqual({ east: 174014, north: 614251 })
  })
  test('rejects malformed values', () => {
    expect(parsePackedCoord(null)).toBeNull()
    expect(parsePackedCoord(1234)).toBeNull()
  })
})

describe('itmToWgs84', () => {
  test('converts Azrieli Center Tel Aviv area to correct WGS84', () => {
    // ITM ~(179254, 664323) is the Azrieli Center: ~32.071N, 34.779E
    const { lat, lng } = itmToWgs84(179254, 664323)
    expect(lat).toBeCloseTo(32.071, 2)
    expect(lng).toBeCloseTo(34.779, 2)
  })
})

describe('recordsToLocalities', () => {
  const rec = (over: Record<string, unknown>) => ({
    'סמל יישוב': 5000,
    'שם יישוב': 'תל אביב -יפו',
    'סך הכל אוכלוסייה 2023 - ארעי': 474530,
    'קואורדינטות': 178690663900,
    ...over,
  })
  test('maps a valid record and trims the name', () => {
    const out = recordsToLocalities([rec({ 'שם יישוב': ' תל אביב -יפו ' })])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(5000)
    expect(out[0].name).toBe('תל אביב -יפו')
    expect(out[0].pop).toBe(474530)
    expect(out[0].lat).toBeGreaterThan(29.4)
    expect(out[0].lat).toBeLessThan(33.4)
    expect(out[0].lng).toBeGreaterThan(34.2)
    expect(out[0].lng).toBeLessThan(35.95)
  })
  test('drops records missing coords or population', () => {
    expect(recordsToLocalities([rec({ 'קואורדינטות': null })])).toHaveLength(0)
    expect(recordsToLocalities([rec({ 'סך הכל אוכלוסייה 2023 - ארעי': null })])).toHaveLength(0)
  })
  test('finds the population field by prefix even if the year changes', () => {
    const r = rec({})
    delete (r as Record<string, unknown>)['סך הכל אוכלוסייה 2023 - ארעי']
    ;(r as Record<string, unknown>)['סך הכל אוכלוסייה 2024 - ארעי'] = 1234
    expect(recordsToLocalities([r])[0].pop).toBe(1234)
  })
})
