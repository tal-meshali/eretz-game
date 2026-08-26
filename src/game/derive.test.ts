import { describe, expect, test } from 'vitest'
import type { Room } from '../types'
import {
  REVEAL_MS,
  currentRoundIndex,
  deadlineOf,
  eligibleHost,
  hostAction,
  phaseOf,
  scoresFor,
  shouldClose,
} from './derive'
import type { Locality } from './localities'

const LOCS: Locality[] = [
  { id: 10, name: 'א', lat: 32.0, lng: 34.8, pop: 50000 },
  { id: 20, name: 'ב', lat: 31.5, lng: 34.9, pop: 50000 },
]

function room(over: Partial<Room> = {}): Room {
  return {
    createdAt: 1000,
    hostUid: 'h',
    state: 'lobby',
    config: { rounds: 2, seconds: 20, difficulty: 'easy' },
    players: {
      h: { name: 'מארח', joinedAt: 1000, online: true },
      p: { name: 'שחקן', joinedAt: 2000, online: true },
    },
    ...over,
  }
}

const T0 = 100_000

describe('phaseOf / currentRoundIndex', () => {
  test('lobby', () => {
    expect(phaseOf(room())).toBe('lobby')
    expect(currentRoundIndex(room())).toBe(-1)
  })
  test('guessing while round open', () => {
    const r = room({ state: 'playing', rounds: [{ localityId: 10, startedAt: T0 }] })
    expect(phaseOf(r)).toBe('guessing')
    expect(currentRoundIndex(r)).toBe(0)
  })
  test('reveal once revealAt set', () => {
    const r = room({
      state: 'playing',
      rounds: [{ localityId: 10, startedAt: T0, revealAt: T0 + 5000 }],
    })
    expect(phaseOf(r)).toBe('reveal')
  })
  test('finished', () => {
    expect(phaseOf(room({ state: 'finished' }))).toBe('finished')
  })
  test('handles null holes in rounds array', () => {
    const r = room({
      state: 'playing',
      rounds: [null, { localityId: 10, startedAt: T0, revealAt: T0 + 20000 }],
    })
    expect(currentRoundIndex(r)).toBe(1)
    const current = r.rounds![currentRoundIndex(r)]
    expect(current).not.toBeNull()
    expect(current?.localityId).toBe(10)
  })
})

describe('deadlineOf / shouldClose', () => {
  const playing = (guesses: Room['guesses']) =>
    room({ state: 'playing', rounds: [{ localityId: 10, startedAt: T0 }], guesses })
  test('deadline = startedAt + seconds', () => {
    expect(deadlineOf({ localityId: 10, startedAt: T0 }, room().config)).toBe(T0 + 20000)
  })
  test('closes when time is up', () => {
    expect(shouldClose(playing(undefined), T0 + 20001)).toBe(true)
    expect(shouldClose(playing(undefined), T0 + 5000)).toBe(false)
  })
  test('closes early when every online player guessed', () => {
    const g = { lat: 32, lng: 34.8, at: T0 + 1 }
    expect(shouldClose(playing({ 0: { h: g, p: g } }), T0 + 5000)).toBe(true)
    expect(shouldClose(playing({ 0: { h: g } }), T0 + 5000)).toBe(false)
  })
  test('offline players are not waited for', () => {
    const g = { lat: 32, lng: 34.8, at: T0 + 1 }
    const r = playing({ 0: { h: g } })
    r.players.p.online = false
    expect(shouldClose(r, T0 + 5000)).toBe(true)
  })
  test('all offline players do not instant-close; deadline still closes', () => {
    const g = { lat: 32, lng: 34.8, at: T0 + 1 }
    const r = playing({ 0: { h: g, p: g } })
    r.players.h.online = false
    r.players.p.online = false
    expect(shouldClose(r, T0 + 5000)).toBe(false)
    expect(shouldClose(r, T0 + 20001)).toBe(true)
  })
})

describe('hostAction', () => {
  test('none in lobby', () => {
    expect(hostAction(room(), T0).type).toBe('none')
  })
  test('close when round should close', () => {
    const r = room({ state: 'playing', rounds: [{ localityId: 10, startedAt: T0 }] })
    expect(hostAction(r, T0 + 21000).type).toBe('close')
  })
  test('next after reveal window on a non-final round', () => {
    const r = room({
      state: 'playing',
      rounds: [{ localityId: 10, startedAt: T0, revealAt: T0 + 20000 }],
    })
    expect(hostAction(r, T0 + 20000 + REVEAL_MS - 1).type).toBe('none')
    expect(hostAction(r, T0 + 20000 + REVEAL_MS + 1).type).toBe('next')
  })
  test('finish after reveal window on the final round', () => {
    const r = room({
      state: 'playing',
      rounds: [
        { localityId: 10, startedAt: T0, revealAt: T0 + 20000 },
        { localityId: 20, startedAt: T0 + 30000, revealAt: T0 + 50000 },
      ],
    })
    expect(hostAction(r, T0 + 50000 + REVEAL_MS + 1).type).toBe('finish')
  })
})

describe('eligibleHost', () => {
  test('earliest-joined online player', () => {
    expect(eligibleHost(room().players)).toBe('h')
    const p = room().players
    p.h.online = false
    expect(eligibleHost(p)).toBe('p')
  })
  test('null when everyone is offline', () => {
    const p = room().players
    p.h.online = false
    p.p.online = false
    expect(eligibleHost(p)).toBeNull()
  })
  test('null with empty players object', () => {
    expect(eligibleHost({})).toBeNull()
  })
})

describe('scoresFor', () => {
  test('scores revealed rounds only, missing guess = null entry and 0 points', () => {
    const r = room({
      state: 'playing',
      rounds: [
        { localityId: 10, startedAt: T0, revealAt: T0 + 20000 },
        { localityId: 20, startedAt: T0 + 30000 }, // still open — not scored
      ],
      guesses: {
        0: { h: { lat: 32.0, lng: 34.8, at: T0 + 1 } }, // bullseye for h, nothing for p
        1: { p: { lat: 31.5, lng: 34.9, at: T0 + 30001 } },
      },
    })
    const s = scoresFor(r, LOCS)
    expect(s.h.total).toBe(1000)
    expect(s.h.byRound[0]!.points).toBe(1000)
    expect(s.h.byRound[0]!.distanceKm).toBeCloseTo(0, 5)
    expect(s.p.total).toBe(0)
    expect(s.p.byRound[0]).toBeNull()
    expect(s.h.byRound).toHaveLength(1)
  })
  test('empty players object returns empty scores object', () => {
    const r = room({
      state: 'playing',
      rounds: [{ localityId: 10, startedAt: T0, revealAt: T0 + 20000 }],
      players: {},
    })
    const s = scoresFor(r, LOCS)
    expect(s).toEqual({})
  })
  test('handles null round holes in scores', () => {
    const r = room({
      state: 'playing',
      rounds: [null, { localityId: 10, startedAt: T0, revealAt: T0 + 20000 }],
      guesses: {
        1: { h: { lat: 32.0, lng: 34.8, at: T0 + 1 } },
      },
    })
    const s = scoresFor(r, LOCS)
    expect(s.h.total).toBe(1000)
    expect(s.h.byRound).toHaveLength(1)
    expect(s.h.byRound[0]!.points).toBe(1000)
  })
})
