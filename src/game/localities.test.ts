import { describe, expect, test } from 'vitest'
import { localityById, pickLocalityId, poolFor, type Locality } from './localities'

const fake: Locality[] = [
  { id: 1, name: 'עיר גדולה', lat: 32, lng: 34.8, pop: 100000 },
  { id: 2, name: 'עיירה', lat: 31.5, lng: 34.9, pop: 8000 },
  { id: 3, name: 'מושב קטן', lat: 33, lng: 35.5, pop: 400 },
]

describe('poolFor', () => {
  test('easy = pop >= 20000', () => {
    expect(poolFor('easy', fake).map((l) => l.id)).toEqual([1])
  })
  test('medium = pop >= 5000', () => {
    expect(poolFor('medium', fake).map((l) => l.id)).toEqual([1, 2])
  })
  test('hard = everything', () => {
    expect(poolFor('hard', fake)).toHaveLength(3)
  })
  test('real dataset tiers have sane sizes', () => {
    expect(poolFor('easy').length).toBeGreaterThan(80)
    expect(poolFor('medium').length).toBeGreaterThan(150)
    expect(poolFor('hard').length).toBeGreaterThan(1100)
  })
})

describe('pickLocalityId', () => {
  test('never returns a used id', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickLocalityId(fake, [1, 3])).toBe(2)
    }
  })
  test('deterministic with injected rand', () => {
    expect(pickLocalityId(fake, [], () => 0)).toBe(1)
    expect(pickLocalityId(fake, [], () => 0.99)).toBe(3)
  })
  test('falls back to allowing repeats when pool is exhausted', () => {
    expect([1, 2, 3]).toContain(pickLocalityId(fake, [1, 2, 3]))
  })
})

describe('localityById', () => {
  test('finds by id', () => {
    expect(localityById(2, fake).name).toBe('עיירה')
  })
  test('throws on unknown id', () => {
    expect(() => localityById(999, fake)).toThrow()
  })
})
