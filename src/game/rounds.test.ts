import { describe, expect, test } from 'vitest'
import { newRoundData } from './rounds'
import { localityById } from './localities'
import type { Room } from '../types'

const roomWith = (localityIds: number[]): Room => ({
  createdAt: 0,
  hostUid: 'a',
  state: 'playing',
  config: { rounds: 5, seconds: 20, difficulty: 'easy' },
  players: { a: { name: 'א', joinedAt: 0, online: true } },
  rounds: localityIds.map((localityId) => ({ localityId, startedAt: 0 })),
})

describe('newRoundData', () => {
  test('stamps the startedAt it was given', () => {
    expect(newRoundData(roomWith([]), 1234).startedAt).toBe(1234)
  })

  test('never repeats a locality already used in the room', () => {
    // Draw the whole easy pool one round at a time; a repeat would show up as
    // a duplicate long before the pool is exhausted.
    let room = roomWith([])
    const seen = new Set<number>()
    for (let i = 0; i < 40; i++) {
      const round = newRoundData(room, i)
      expect(seen.has(round.localityId)).toBe(false)
      seen.add(round.localityId)
      room = { ...room, rounds: [...(room.rounds ?? []), round] }
    }
  })

  test('picks from the pool the room config asks for', () => {
    const room = { ...roomWith([]), config: { rounds: 5, seconds: 20, difficulty: 'easy' as const } }
    const locality = localityById(newRoundData(room, 0).localityId)
    expect(locality.pop).toBeGreaterThan(20_000)
  })

  test('tolerates a room with no rounds yet', () => {
    const room = { ...roomWith([]), rounds: undefined }
    expect(newRoundData(room, 0).localityId).toBeGreaterThan(0)
  })
})
