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
  update,
  type Database,
} from 'firebase/database'
import { pickLocalityId, poolFor } from '../game/localities'
import { generateRoomCode } from '../game/roomCodes'
import type { Room, RoomConfig } from '../types'

const DAY_MS = 24 * 3600_000

export function createRoomClient(db: Database, uid: string) {
  const roomRef = (code: string) => ref(db, `rooms/${code}`)

  async function createRoom(config: RoomConfig, hostName: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode()
      if ((await get(roomRef(code))).exists()) continue
      await set(roomRef(code), {
        createdAt: serverTimestamp(),
        hostUid: uid,
        state: 'lobby',
        config,
        players: { [uid]: { name: hostName, joinedAt: serverTimestamp(), online: true } },
      })
      return code
    }
    throw new Error('could not allocate room code')
  }

  async function joinRoom(code: string, name: string): Promise<void> {
    if (!(await get(roomRef(code))).exists()) throw new Error('room-not-found')
    await set(ref(db, `rooms/${code}/players/${uid}`), {
      name,
      joinedAt: serverTimestamp(),
      online: true,
    })
  }

  function watchRoom(code: string, cb: (room: Room | null) => void): () => void {
    return onValue(roomRef(code), (snap) => cb(snap.val()))
  }

  function setupPresence(code: string): void {
    const onlineRef = ref(db, `rooms/${code}/players/${uid}/online`)
    onValue(ref(db, '.info/connected'), (snap) => {
      if (!snap.val()) return
      onDisconnect(onlineRef).set(false)
      set(onlineRef, true)
    })
  }

  function newRound(room: Room) {
    const used = (room.rounds ?? []).filter(Boolean).map((r) => r!.localityId)
    return {
      localityId: pickLocalityId(poolFor(room.config.difficulty), used),
      startedAt: serverTimestamp(),
    }
  }

  async function startGame(code: string, room: Room): Promise<void> {
    await update(roomRef(code), { state: 'playing', rounds: [newRound(room)] })
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
    await set(ref(db, `rooms/${code}/rounds/${next}`), newRound(room))
  }

  async function finishGame(code: string): Promise<void> {
    await set(ref(db, `rooms/${code}/state`), 'finished')
  }

  async function playAgain(code: string): Promise<void> {
    await update(roomRef(code), { state: 'lobby', rounds: null, guesses: null })
  }

  async function claimHost(code: string): Promise<void> {
    await set(ref(db, `rooms/${code}/hostUid`), uid)
  }

  async function cleanupStaleRooms(): Promise<void> {
    const stale = await get(
      query(ref(db, 'rooms'), orderByChild('createdAt'), endAt(Date.now() - DAY_MS), limitToFirst(20)),
    )
    const jobs: Promise<void>[] = []
    stale.forEach((child) => {
      jobs.push(remove(child.ref))
    })
    await Promise.all(jobs).catch(() => {}) // best-effort housekeeping
  }

  return {
    createRoom,
    joinRoom,
    watchRoom,
    setupPresence,
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
