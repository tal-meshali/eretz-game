import { describe, expect, test } from 'vitest'
import { codeFromHash, generateRoomCode, isValidRoomCode } from './roomCodes'

describe('generateRoomCode', () => {
  test('4 chars from the safe alphabet', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
    }
  })
  test('deterministic with injected rand', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAA')
  })
})

describe('isValidRoomCode', () => {
  test('accepts generated codes', () => {
    expect(isValidRoomCode('ABCD')).toBe(true)
  })
  test('rejects wrong length, excluded letters, lowercase', () => {
    expect(isValidRoomCode('ABC')).toBe(false)
    expect(isValidRoomCode('ABIO')).toBe(false)
    expect(isValidRoomCode('abcd')).toBe(false)
  })
})

describe('codeFromHash', () => {
  test('parses "#ABCD" and normalizes case', () => {
    expect(codeFromHash('#ABCD')).toBe('ABCD')
    expect(codeFromHash('#abcd')).toBe('ABCD')
  })
  test('returns null for empty or invalid hash', () => {
    expect(codeFromHash('')).toBeNull()
    expect(codeFromHash('#')).toBeNull()
    expect(codeFromHash('#TOOLONG')).toBeNull()
  })
})
