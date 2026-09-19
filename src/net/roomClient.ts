import {
  endAt,
  get,
  limitToFirst,
  onDisconnect,
  onValue,
  orderByChild,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  startAt,
  update,
  type Database,
  type DatabaseReference,
} from 'firebase/database'
// serverTimestamp() is a sentinel object the server replaces on write, not a
// number — the Room type describes what comes back out, not what goes in.
import { newRoundData } from '../game/rounds'
import { generateRoomCode } from '../game/roomCodes'
import type { Room, RoomConfig } from '../types'

const DAY_MS = 24 * 3600_000
// keep in sync with the finished-room grace period in database.rules.json
const FINISHED_TTL_MS = 3600_000

export function createRoomClient(db: Database, uid: string) {
  const roomRef = (code: string) => ref(db, `rooms/${code}`)

  // Resolves once the realtime websocket is up (or after timeoutMs — callers
  // still handle failure). get() rejects with "client is offline" until then,
  // which on slow networks outlives any reasonable retry loop.
  function waitForConnection(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false
      let unsubscribe = () => {}
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
      const timer = setTimeout(finish, timeoutMs)
      unsubscribe = onValue(ref(db, '.info/connected'), (snap) => {
        if (snap.val() === true) finish()
      })
      if (done) unsubscribe()
    })
  }

  async function createRoom(config: RoomConfig, hostName: string): Promise<string> {
    await waitForConnection(8000)
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode()
      if ((await get(roomRef(code))).exists()) continue
      try {
        await set(roomRef(code), {
          createdAt: serverTimestamp(),
          hostUid: uid,
          state: 'lobby',
          config,
          players: { [uid]: { name: hostName, joinedAt: serverTimestamp(), online: true } },
        })
        return code
      } catch {
        // another client created this code between our get() and set() — retry with a new code
        continue
      }
    }
    throw new Error('could not allocate room code')
  }

  async function joinRoom(code: string, name: string): Promise<void> {
    // A share-link cold load reaches here while the websocket is still
    // connecting, so wait for it before probing the room. A missing room
    // RESOLVES with exists() === false, so only a resolved read may declare
    // it missing; rejections get retried, then surface as a retryable failure.
    await waitForConnection(8000)
    let exists = false
    for (let attempt = 0; ; attempt++) {
      try {
        exists = (await get(roomRef(code))).exists()
        break
      } catch {
        if (attempt >= 2) throw new Error('join-failed')
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }
    if (!exists) throw new Error('room-not-found')
    await set(ref(db, `rooms/${code}/players/${uid}`), {
      name,
      joinedAt: serverTimestamp(),
      online: true,
    })
  }

  function watchRoom(code: string, cb: (room: Room | null) => void): () => void {
    return onValue(roomRef(code), (snap) => cb(snap.val()))
  }

  let presence: { unsubscribe: () => void; onlineRef: DatabaseReference } | null = null

  function teardownPresence(): void {
    if (!presence) return
    presence.unsubscribe()
    onDisconnect(presence.onlineRef).cancel()
    set(presence.onlineRef, false).catch(() => {})
    presence = null
  }

  function setupPresence(code: string): void {
    teardownPresence()
    const onlineRef = ref(db, `rooms/${code}/players/${uid}/online`)
    const unsubscribe = onValue(ref(db, '.info/connected'), (snap) => {
      if (!snap.val()) return
      onDisconnect(onlineRef).set(false)
      set(onlineRef, true)
    })
    presence = { unsubscribe, onlineRef }
  }

  async function startGame(code: string, room: Room): Promise<void> {
    await update(roomRef(code), {
      state: 'playing',
      rounds: [newRoundData(room, serverTimestamp() as unknown as number)],
    })
  }

  async function submitGuess(code: string, roundIndex: number, guess: { lat: number; lng: number }) {
    await set(ref(db, `rooms/${code}/guesses/${roundIndex}/${uid}`), {
      ...guess,
      at: serverTimestamp(),
    })
  }

  async function closeRound(code: string, roundIndex: number): Promise<void> {
    await set(ref(db, `rooms/${code}/rounds/${roundIndex}/revealAt`), serverTimestamp())
  }

  async function startNextRound(code: string, room: Room): Promise<void> {
    const next = room.rounds?.length ?? 0
    await set(ref(db, `rooms/${code}/rounds/${next}`), newRoundData(room, serverTimestamp() as unknown as number))
  }

  async function finishGame(code: string): Promise<void> {
    await update(roomRef(code), { state: 'finished', finishedAt: serverTimestamp() })
  }

  async function playAgain(code: string): Promise<void> {
    await update(roomRef(code), { state: 'lobby', rounds: null, guesses: null, finishedAt: null })
  }

  async function claimHost(code: string): Promise<void> {
    await set(ref(db, `rooms/${code}/hostUid`), uid)
  }

  async function cleanupStaleRooms(): Promise<void> {
    const sweeps = [
      query(ref(db, 'rooms'), orderByChild('createdAt'), endAt(Date.now() - DAY_MS), limitToFirst(20)),
      // startAt(1) skips rooms with no finishedAt (null orders before numbers)
      query(
        ref(db, 'rooms'),
        orderByChild('finishedAt'),
        startAt(1),
        endAt(Date.now() - FINISHED_TTL_MS),
        limitToFirst(20),
      ),
    ]
    const jobs: Promise<void>[] = []
    for (const sweep of sweeps) {
      const stale = await get(sweep).catch(() => null)
      stale?.forEach((child) => {
        jobs.push(remove(child.ref).catch(() => {}))
      })
    }
    await Promise.all(jobs) // best-effort housekeeping
  }

  return {
    createRoom,
    joinRoom,
    watchRoom,
    setupPresence,
    teardownPresence,
    startGame,
    submitGuess,
    closeRound,
    startNextRound,
    finishGame,
    playAgain,
    claimHost,
    cleanupStaleRooms,
  }
}

export type RoomClient = ReturnType<typeof createRoomClient>
