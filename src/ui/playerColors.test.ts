import { describe, expect, test } from 'vitest'
import { playerColor } from './playerColors'
import type { Room } from '../types'

const room = {
  players: {
    b: { name: 'ב', joinedAt: 2, online: true },
    a: { name: 'א', joinedAt: 1, online: true },
  },
} as unknown as Room

describe('playerColor', () => {
  test('stable and distinct by join order', () => {
    expect(playerColor('a', room)).toBe(playerColor('a', room))
    expect(playerColor('a', room)).not.toBe(playerColor('b', room))
  })
})
