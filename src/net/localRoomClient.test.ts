import { describe, expect, test, vi } from 'vitest'
import { createLocalRoomClient } from './localRoomClient'
import type { RoomClient } from './roomClient'
import { currentRoundIndex, hostAction, phaseOf } from '../game/derive'
import type { Room, RoomConfig } from '../types'

const CONFIG: RoomConfig = { rounds: 3, seconds: 10, difficulty: 'easy' }
const UID = 'solo'

async function started() {
  const client = createLocalRoomClient(UID)
  const code = await client.createRoom(CONFIG, 'אני')
  let room: Room | null = null
  client.watchRoom(code, (r) => (room = r))
  await client.startGame(code, room!)
  return { client, code, read: () => room! }
}

describe('createLocalRoomClient', () => {
  test('is assignable to the Firebase client interface', () => {
    // The whole design rests on the two being interchangeable; this is the
    // only place that is checked, and it is checked at compile time.
    const client: RoomClient = createLocalRoomClient(UID)
    expect(typeof client.watchRoom).toBe('function')
  })

  test('createRoom yields a lobby holding exactly the one player', async () => {
    const client = createLocalRoomClient(UID)
    const code = await client.createRoom(CONFIG, 'אני')
    let room: Room | null = null
    client.watchRoom(code, (r) => (room = r))
    expect(room!.state).toBe('lobby')
    expect(room!.hostUid).toBe(UID)
    expect(Object.keys(room!.players)).toEqual([UID])
    expect(room!.players[UID]).toMatchObject({ name: 'אני', online: true })
    expect(phaseOf(room!)).toBe('lobby')
  })

  test('watchRoom fires on every mutation and stops after unsubscribe', async () => {
    const client = createLocalRoomClient(UID)
    const code = await client.createRoom(CONFIG, 'אני')
    const seen = vi.fn()
    const stop = client.watchRoom(code, seen)
    expect(seen).toHaveBeenCalledTimes(1) // immediately, with the current room
    let room: Room | null = null
    client.watchRoom(code, (r) => (room = r))
    await client.startGame(code, room!)
    expect(seen).toHaveBeenCalledTimes(2)
    stop()
    await client.closeRound(code, 0)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  test('a full round: guess, close, next', async () => {
    const { client, code, read } = await started()
    expect(phaseOf(read())).toBe('guessing')

    await client.submitGuess(code, 0, { lat: 32, lng: 34.8 })
    expect(read().guesses![0][UID]).toMatchObject({ lat: 32, lng: 34.8 })

    // One online player who has guessed is every online player, so the engine
    // asks to close immediately — this is what makes a solo round fast.
    expect(hostAction(read(), Date.now()).type).toBe('close')

    await client.closeRound(code, 0)
    expect(phaseOf(read())).toBe('reveal')

    await client.startNextRound(code, read())
    expect(currentRoundIndex(read())).toBe(1)
    expect(phaseOf(read())).toBe('guessing')
  })

  test('a later round never repeats an earlier locality', async () => {
    const { client, code, read } = await started()
    const ids = new Set([read().rounds![0]!.localityId])
    for (let i = 1; i < 12; i++) {
      await client.startNextRound(code, read())
      const id = read().rounds![i]!.localityId
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }
  })

  test('finishGame then playAgain returns an empty lobby', async () => {
    const { client, code, read } = await started()
    await client.submitGuess(code, 0, { lat: 32, lng: 34.8 })
    await client.closeRound(code, 0)
    await client.finishGame(code)
    expect(phaseOf(read())).toBe('finished')
    expect(read().finishedAt).toBeGreaterThan(0)

    await client.playAgain(code)
    expect(phaseOf(read())).toBe('lobby')
    expect(read().rounds).toBeUndefined()
    expect(read().guesses).toBeUndefined()
    expect(read().finishedAt).toBeUndefined()
    expect(Object.keys(read().players)).toEqual([UID]) // the player survives
  })

  test('presence and housekeeping are inert, not missing', async () => {
    const { client, code, read } = await started()
    expect(() => client.setupPresence(code)).not.toThrow()
    expect(() => client.teardownPresence()).not.toThrow()
    await expect(client.cleanupStaleRooms()).resolves.toBeUndefined()
    await expect(client.joinRoom(code, 'אני')).resolves.toBeUndefined()
    expect(read().players[UID].online).toBe(true)
  })
})
