import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, get, getDatabase, ref, set } from 'firebase/database'
import { createRoomClient, type RoomClient } from './roomClient'
import type { Room } from '../types'

const CFG = {
  apiKey: 'demo',
  projectId: 'demo-eretz',
  databaseURL: 'https://demo-eretz-default-rtdb.firebaseio.com',
}

const apps: FirebaseApp[] = []

async function makeClient(name: string): Promise<{ client: RoomClient; uid: string }> {
  const app = initializeApp(CFG, name)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getDatabase(app)
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  const { user } = await signInAnonymously(auth)
  return { client: createRoomClient(db, user.uid), uid: user.uid }
}

function waitForRoom(client: RoomClient, code: string, pred: (r: Room) => boolean): Promise<Room> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for room state')), 10000)
    const stop = client.watchRoom(code, (room) => {
      if (room && pred(room)) {
        clearTimeout(timer)
        stop()
        resolve(room)
      }
    })
  })
}

let host: { client: RoomClient; uid: string }
let guest: { client: RoomClient; uid: string }

beforeAll(async () => {
  host = await makeClient('host')
  guest = await makeClient('guest')
})
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)))
})

const CONFIG = { rounds: 2, seconds: 20, difficulty: 'easy' as const }

describe('roomClient full game flow', () => {
  test('create → join → start → guess → close → next → finish → play again', async () => {
    const code = await host.client.createRoom(CONFIG, 'מארח')
    expect(code).toMatch(/^[A-Z]{4}$/)

    await guest.client.joinRoom(code, 'אורח')
    let room = await waitForRoom(host.client, code, (r) => Object.keys(r.players).length === 2)
    expect(room.players[guest.uid].name).toBe('אורח')
    expect(room.state).toBe('lobby')

    await host.client.startGame(code, room)
    room = await waitForRoom(guest.client, code, (r) => r.state === 'playing')
    expect(room.rounds).toHaveLength(1)
    expect(typeof room.rounds![0]!.startedAt).toBe('number')
    expect(room.rounds![0]!.localityId).toBeGreaterThan(0)

    await host.client.submitGuess(code, 0, { lat: 32.1, lng: 34.8 })
    await guest.client.submitGuess(code, 0, { lat: 31.8, lng: 35.2 })
    room = await waitForRoom(host.client, code, (r) => !!r.guesses?.[0]?.[guest.uid])

    await host.client.closeRound(code, 0)
    room = await waitForRoom(guest.client, code, (r) => !!r.rounds?.[0]?.revealAt)

    await host.client.startNextRound(code, room)
    room = await waitForRoom(guest.client, code, (r) => (r.rounds?.length ?? 0) === 2)
    expect(room.rounds![1]!.localityId).not.toBe(room.rounds![0]!.localityId)

    await host.client.finishGame(code)
    room = await waitForRoom(guest.client, code, (r) => r.state === 'finished')

    await host.client.playAgain(code)
    room = await waitForRoom(guest.client, code, (r) => r.state === 'lobby')
    expect(room.rounds).toBeUndefined()
    expect(room.guesses).toBeUndefined()
    expect(Object.keys(room.players)).toHaveLength(2)
  })

  test('joinRoom rejects for a nonexistent room', async () => {
    await expect(guest.client.joinRoom('QQQQ', 'מישהו')).rejects.toThrow('room-not-found')
  })

  test('claimHost transfers hostUid', async () => {
    const code = await host.client.createRoom(CONFIG, 'מארח')
    await guest.client.joinRoom(code, 'אורח')
    await guest.client.claimHost(code)
    const room = await waitForRoom(host.client, code, (r) => r.hostUid === guest.uid)
    expect(room.hostUid).toBe(guest.uid)
  })

  test('setupPresence tears down previous room registration when switching rooms', async () => {
    const codeA = await host.client.createRoom(CONFIG, 'מארח')
    const codeB = await host.client.createRoom(CONFIG, 'מארח')

    host.client.setupPresence(codeA)
    await waitForRoom(host.client, codeA, (r) => r.players[host.uid].online === true)

    host.client.setupPresence(codeB)
    await waitForRoom(host.client, codeB, (r) => r.players[host.uid].online === true)
    const roomA = await waitForRoom(host.client, codeA, (r) => r.players[host.uid].online === false)

    expect(roomA.players[host.uid].online).toBe(false)
  })

  test('teardownPresence marks the player offline and stops the listener', async () => {
    const code = await host.client.createRoom(CONFIG, 'מארח')

    host.client.setupPresence(code)
    await waitForRoom(host.client, code, (r) => r.players[host.uid].online === true)

    host.client.teardownPresence()
    const room = await waitForRoom(host.client, code, (r) => r.players[host.uid].online === false)

    expect(room.players[host.uid].online).toBe(false)
  })

  test('cleanupStaleRooms deletes only 24h+ rooms', async () => {
    const staleCode = 'ZOLD'
    const db = getDatabase(apps[0])
    await set(ref(db, `rooms/${staleCode}`), {
      createdAt: Date.now() - 25 * 3600_000,
      hostUid: host.uid,
      state: 'lobby',
      config: CONFIG,
      players: { [host.uid]: { name: 'x', joinedAt: 1, online: false } },
    })
    const freshCode = await host.client.createRoom(CONFIG, 'מארח')
    await host.client.cleanupStaleRooms()
    expect((await get(ref(db, `rooms/${staleCode}`))).exists()).toBe(false)
    expect((await get(ref(db, `rooms/${freshCode}`))).exists()).toBe(true)
  })
})
