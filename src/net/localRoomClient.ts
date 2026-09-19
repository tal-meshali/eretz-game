import { generateRoomCode } from '../game/roomCodes'
import { newRoundData } from '../game/rounds'
import type { Room, RoomConfig } from '../types'

/* The same seam `createRoomClient` fills, backed by one object in memory
   instead of Firebase. It exists so the game can be played alone and without
   signing in — which is how the round loop, the reveal and the map get
   exercised without a second person in the room. Not truly offline: the
   Firebase SDK still initialises at module load, subscribes to
   `.info/serverTimeOffset`, runs `watchUser` and calls
   `completeRedirectSignIn()` — solo mode degrades gracefully without a
   working backend, and needs no sign-in and no room on the server, but it
   does not avoid Firebase entirely.

   It deliberately imports nothing from `firebase/*`: this module is gated on
   `import.meta.env.DEV` at its one call site, and dragging the SDK into that
   branch would defeat the gate. `scripts/check-bundle.mjs` enforces the
   result.

   What it does NOT cover, and what the Playwright smoke test remains the only
   cover for: the RTDB writes themselves, the security rules, presence, and
   host migration between two clients. */
export function createLocalRoomClient(uid: string, clock: () => number = Date.now) {
  // `clock` rather than a bare `Date.now()` call: App.tsx compares every
  // timestamp this client writes (startedAt, revealAt, guess.at) against
  // `serverNow()`, which is `Date.now() + offsetMs` — the RTDB clock offset.
  // That subscription runs unconditionally (gated only on Firebase being
  // configured, which it always is), so it is live even in solo mode. A
  // local client stamping bare `Date.now()` would skew every round deadline
  // and the reveal hold by whatever that offset is. The call site passes
  // `serverNow` itself so both sides of every comparison agree.
  let room: Room | null = null
  const watchers = new Set<(room: Room | null) => void>()

  const emit = () => {
    for (const watcher of watchers) watcher(room)
  }

  /** Every mutation replaces the room object rather than editing it, so a
   *  React consumer sees a new reference and re-renders — the same thing a
   *  fresh RTDB snapshot gives it. */
  const mutate = (fn: (current: Room) => Room) => {
    if (!room) return
    room = fn(room)
    emit()
  }

  async function createRoom(config: RoomConfig, hostName: string): Promise<string> {
    const now = clock()
    room = {
      createdAt: now,
      hostUid: uid,
      state: 'lobby',
      config,
      players: { [uid]: { name: hostName, joinedAt: now, online: true } },
    }
    emit()
    // A real code rather than a fixed literal: the lobby renders it, and it is
    // one less way this room looks unlike a real one.
    return generateRoomCode()
  }

  // The single player is created by createRoom, so there is never anyone to
  // add. Present because the seam has it, not because solo mode needs it.
  // The parameters are declared even though they are unused: callers pass
  // them, and a zero-parameter function cannot be called with arguments.
  async function joinRoom(_code: string, _name: string): Promise<void> {}

  function watchRoom(_code: string, cb: (room: Room | null) => void): () => void {
    watchers.add(cb)
    cb(room)
    return () => {
      watchers.delete(cb)
    }
  }

  // Nobody can disconnect from a room inside their own tab; the player is
  // online for as long as the room exists.
  function setupPresence(_code: string): void {}
  function teardownPresence(): void {}

  async function startGame(_code: string, _room: Room): Promise<void> {
    mutate((current) => ({
      ...current,
      state: 'playing',
      rounds: [newRoundData(current, clock())],
    }))
  }

  async function submitGuess(
    _code: string, roundIndex: number, guess: { lat: number; lng: number },
  ): Promise<void> {
    mutate((current) => ({
      ...current,
      guesses: {
        ...current.guesses,
        [roundIndex]: { ...current.guesses?.[roundIndex], [uid]: { ...guess, at: clock() } },
      },
    }))
  }

  async function closeRound(_code: string, roundIndex: number): Promise<void> {
    mutate((current) => {
      const rounds = [...(current.rounds ?? [])]
      const round = rounds[roundIndex]
      if (round) rounds[roundIndex] = { ...round, revealAt: clock() }
      return { ...current, rounds }
    })
  }

  async function startNextRound(_code: string, _room: Room): Promise<void> {
    // Read the live room rather than the caller's copy: the used-locality list
    // has to be the current one or a round can repeat.
    mutate((current) => ({
      ...current,
      rounds: [...(current.rounds ?? []), newRoundData(current, clock())],
    }))
  }

  async function finishGame(_code: string): Promise<void> {
    mutate((current) => ({ ...current, state: 'finished', finishedAt: clock() }))
  }

  async function playAgain(_code: string): Promise<void> {
    // undefined, not null: the Room type describes what RTDB reads back, where
    // a cleared key is simply absent.
    mutate((current) => ({
      ...current,
      state: 'lobby',
      rounds: undefined,
      guesses: undefined,
      finishedAt: undefined,
    }))
  }

  async function claimHost(_code: string): Promise<void> {
    mutate((current) => ({ ...current, hostUid: uid }))
  }

  async function cleanupStaleRooms(): Promise<void> {}

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

export type LocalRoomClient = ReturnType<typeof createLocalRoomClient>
