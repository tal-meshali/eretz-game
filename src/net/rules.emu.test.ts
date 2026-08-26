import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { get, ref, set, update } from 'firebase/database'

let env: RulesTestEnvironment

const freshRoom = (createdAt: number) => ({
  createdAt,
  hostUid: 'alice',
  state: 'lobby',
  config: { rounds: 10, seconds: 20, difficulty: 'easy' },
  players: { alice: { name: 'אליס', joinedAt: createdAt, online: true } },
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-eretz',
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  })
})
afterAll(async () => {
  await env.cleanup()
})
beforeEach(async () => {
  await env.clearDatabase()
})

const dbAs = (uid: string) => env.authenticatedContext(uid).database()
const anonDb = () => env.unauthenticatedContext().database()

describe('room security rules', () => {
  test('unauthenticated users can neither read nor create rooms', async () => {
    await assertFails(set(ref(anonDb(), 'rooms/AAAA'), freshRoom(Date.now())))
    await assertFails(get(ref(anonDb(), 'rooms/AAAA')))
  })

  test('authed user can create and read a room', async () => {
    await assertSucceeds(set(ref(dbAs('alice'), 'rooms/AAAA'), freshRoom(Date.now())))
    await assertSucceeds(get(ref(dbAs('bob'), 'rooms/AAAA')))
  })

  test('players can only write their own player node', async () => {
    await set(ref(dbAs('alice'), 'rooms/AAAA'), freshRoom(Date.now()))
    await assertSucceeds(
      set(ref(dbAs('bob'), 'rooms/AAAA/players/bob'), { name: 'בוב', joinedAt: 2, online: true }),
    )
    await assertFails(
      set(ref(dbAs('bob'), 'rooms/AAAA/players/alice'), { name: 'לא', joinedAt: 3, online: true }),
    )
  })

  test('joining a room that does not exist is rejected (no ghost rooms)', async () => {
    // A join racing a room deletion must not resurrect the room as a
    // players-only zombie that traps every later joiner.
    await assertFails(
      set(ref(dbAs('bob'), 'rooms/GONE/players/bob'), { name: 'בוב', joinedAt: 2, online: true }),
    )
  })

  test('presence updates still work on an existing room', async () => {
    await set(ref(dbAs('alice'), 'rooms/AAAA'), freshRoom(Date.now()))
    await assertSucceeds(set(ref(dbAs('alice'), 'rooms/AAAA/players/alice/online'), false))
  })

  test('a guess is write-once and owner-only', async () => {
    await set(ref(dbAs('alice'), 'rooms/AAAA'), freshRoom(Date.now()))
    const guess = { lat: 32, lng: 34.8, at: 5 }
    await assertSucceeds(set(ref(dbAs('bob'), 'rooms/AAAA/guesses/0/bob'), guess))
    await assertFails(set(ref(dbAs('bob'), 'rooms/AAAA/guesses/0/bob'), { ...guess, lat: 31 }))
    await assertFails(set(ref(dbAs('alice'), 'rooms/AAAA/guesses/0/bob'), guess))
  })

  test('guesses can be cleared wholesale (play again reset)', async () => {
    await set(ref(dbAs('alice'), 'rooms/AAAA'), freshRoom(Date.now()))
    await set(ref(dbAs('bob'), 'rooms/AAAA/guesses/0/bob'), { lat: 32, lng: 34.8, at: 5 })
    await assertSucceeds(
      update(ref(dbAs('alice'), 'rooms/AAAA'), { guesses: null, rounds: null, state: 'lobby' }),
    )
  })

  test('rooms are deletable only after 24h', async () => {
    await set(ref(dbAs('alice'), 'rooms/OLDR'), freshRoom(Date.now() - 25 * 3600_000))
    await set(ref(dbAs('alice'), 'rooms/NEWR'), freshRoom(Date.now()))
    await assertSucceeds(set(ref(dbAs('bob'), 'rooms/OLDR'), null))
    await assertFails(set(ref(dbAs('bob'), 'rooms/NEWR'), null))
  })

  test('a createdAt-less ghost room is deletable at any age', async () => {
    // Ghosts predating the join hardening have no createdAt, so the 24h
    // comparison is never true — without this carve-out they are immortal
    // and cleanupStaleRooms can never purge them.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'rooms/GHST'), {
        players: { bob: { name: 'בוב', joinedAt: 2, online: true } },
      })
    })
    await assertSucceeds(set(ref(dbAs('alice'), 'rooms/GHST'), null))
  })
})
