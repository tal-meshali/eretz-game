# Solo Local Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only button that plays a full game alone, in memory, with no Firebase and no Google sign-in.

**Architecture:** `RoomClient` is a duck-typed seam of thirteen methods, and the phase machine, scorer and host engine in `App.tsx` are already pure over a `Room`. A second implementation of that seam holds one `Room` in a closure and notifies subscribers on every mutation, so solo mode swaps *where the room lives* and reuses the real loop unchanged.

**Tech Stack:** TypeScript, React 19, Vite 8 (Rolldown), Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-09-19-solo-local-play-design.md](../specs/2026-09-19-solo-local-play-design.md)

## Global Constraints

- Domain strings are Hebrew. Comments explain constraints and *why*, never *what*.
- `SOLO_UID` is the literal `'solo'`; `SOLO_NAME` is `'שחקן מקומי'`. Both are module constants in `src/App.tsx`.
- The local client must never import from `src/firebase.ts` or `firebase/*`. It is dev-only code and must not drag the SDK into a branch the bundler is meant to drop.
- `Date.now()` stands in for `serverTimestamp()` throughout the local client.
- The room code lives in React state, never in `window.location.hash`. `codeFromHash` validates against `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, L or O), and a hash-based solo code would either have to be a real generated code in the URL or change that grammar.
- Every task ends green: `npx tsc --noEmit -p tsconfig.json` and `npm test` both pass before the commit.

## Spec deviation found during planning

`src/ui/Lobby.tsx:59` disables the start button with `disabled={players.length < 2}`, so a one-player room can never be started. The spec did not account for it. **Task 3** adds a `minPlayers` prop to `Lobby`; without it the feature does not work at all.

---

### Task 1: Extract `newRoundData`

Both clients need to pick a round, and two copies can drift — at which point solo mode stops being a faithful test of the real client, which is its only reason to exist. The timestamp becomes a parameter because it is the single thing the two modes disagree about.

**Files:**
- Create: `src/game/rounds.ts`
- Create: `src/game/rounds.test.ts`
- Modify: `src/net/roomClient.ts` (delete the `newRound` closure, import the extraction)

**Interfaces:**
- Consumes: `pickLocalityId`, `poolFor` from `src/game/localities.ts`; `Room`, `RoundData` from `src/types.ts`
- Produces: `newRoundData(room: Room, startedAt: number): RoundData`

- [ ] **Step 1: Write the failing test**

Create `src/game/rounds.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/game/rounds.test.ts`
Expected: FAIL — `Failed to resolve import "./rounds"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/rounds.ts`:

```ts
import { pickLocalityId, poolFor } from './localities'
import type { Room, RoundData } from '../types'

/** The next round for a room, avoiding every locality it has already used.
 *
 *  `startedAt` is a parameter rather than a call to the clock because the two
 *  room clients disagree about what "now" is: the Firebase one writes a
 *  `serverTimestamp()` sentinel the server resolves, the local one writes
 *  `Date.now()`. That is the only difference between them, and keeping the
 *  pick itself in one place is what makes solo mode a test of the real thing.
 */
export function newRoundData(room: Room, startedAt: number): RoundData {
  const used = (room.rounds ?? []).filter(Boolean).map((r) => r!.localityId)
  return { localityId: pickLocalityId(poolFor(room.config.difficulty), used), startedAt }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/game/rounds.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Rewire the Firebase client**

In `src/net/roomClient.ts`, delete the `newRound` closure:

```ts
  function newRound(room: Room) {
    const used = (room.rounds ?? []).filter(Boolean).map((r) => r!.localityId)
    return {
      localityId: pickLocalityId(poolFor(room.config.difficulty), used),
      startedAt: serverTimestamp(),
    }
  }
```

Replace both call sites — in `startGame` and `startNextRound` — with
`newRoundData(room, serverTimestamp() as unknown as number)`. The cast is
load-bearing and needs this comment above the import:

```ts
// serverTimestamp() is a sentinel object the server replaces on write, not a
// number — the Room type describes what comes back out, not what goes in.
```

Change the import line `import { pickLocalityId, poolFor } from '../game/localities'` to `import { newRoundData } from '../game/rounds'`, and drop `pickLocalityId`/`poolFor` if nothing else in the file uses them (nothing does).

- [ ] **Step 6: Verify nothing regressed**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc silent; all existing tests plus the 4 new ones pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/rounds.ts src/game/rounds.test.ts src/net/roomClient.ts
git commit -m "refactor: extract newRoundData so both room clients share one pick"
```

---

### Task 2: The in-memory room client

**Files:**
- Create: `src/net/localRoomClient.ts`
- Create: `src/net/localRoomClient.test.ts`

**Interfaces:**
- Consumes: `newRoundData` from Task 1; `generateRoomCode` from `src/game/roomCodes.ts`; `Room`, `RoomConfig`, `Guess` from `src/types.ts`
- Produces: `createLocalRoomClient(uid: string)` and `export type LocalRoomClient = ReturnType<typeof createLocalRoomClient>`. It is structurally assignable to `RoomClient` — Task 4 passes it where the Firebase client goes.

- [ ] **Step 1: Write the failing test**

Create `src/net/localRoomClient.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/net/localRoomClient.test.ts`
Expected: FAIL — `Failed to resolve import "./localRoomClient"`.

- [ ] **Step 3: Write the implementation**

Create `src/net/localRoomClient.ts`:

```ts
import { generateRoomCode } from '../game/roomCodes'
import { newRoundData } from '../game/rounds'
import type { Room, RoomConfig } from '../types'

/* The same seam `createRoomClient` fills, backed by one object in memory
   instead of Firebase. It exists so the game can be played alone, offline and
   without signing in — which is how the round loop, the reveal and the map get
   exercised without a second person in the room.

   It deliberately imports nothing from `firebase/*`: this module is gated on
   `import.meta.env.DEV` at its one call site, and dragging the SDK into that
   branch would defeat the gate. `scripts/check-bundle.mjs` enforces the
   result.

   What it does NOT cover, and what the Playwright smoke test remains the only
   cover for: the RTDB writes themselves, the security rules, presence, and
   host migration between two clients. */
export function createLocalRoomClient(uid: string) {
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
    const now = Date.now()
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
  async function joinRoom(): Promise<void> {}

  function watchRoom(_code: string, cb: (room: Room | null) => void): () => void {
    watchers.add(cb)
    cb(room)
    return () => {
      watchers.delete(cb)
    }
  }

  // Nobody can disconnect from a room inside their own tab; the player is
  // online for as long as the room exists.
  function setupPresence(): void {}
  function teardownPresence(): void {}

  async function startGame(_code: string, _room: Room): Promise<void> {
    mutate((current) => ({
      ...current,
      state: 'playing',
      rounds: [newRoundData(current, Date.now())],
    }))
  }

  async function submitGuess(
    _code: string, roundIndex: number, guess: { lat: number; lng: number },
  ): Promise<void> {
    mutate((current) => ({
      ...current,
      guesses: {
        ...current.guesses,
        [roundIndex]: { ...current.guesses?.[roundIndex], [uid]: { ...guess, at: Date.now() } },
      },
    }))
  }

  async function closeRound(_code: string, roundIndex: number): Promise<void> {
    mutate((current) => {
      const rounds = [...(current.rounds ?? [])]
      const round = rounds[roundIndex]
      if (round) rounds[roundIndex] = { ...round, revealAt: Date.now() }
      return { ...current, rounds }
    })
  }

  async function startNextRound(_code: string, _room: Room): Promise<void> {
    // Read the live room rather than the caller's copy: the used-locality list
    // has to be the current one or a round can repeat.
    mutate((current) => ({
      ...current,
      rounds: [...(current.rounds ?? []), newRoundData(current, Date.now())],
    }))
  }

  async function finishGame(): Promise<void> {
    mutate((current) => ({ ...current, state: 'finished', finishedAt: Date.now() }))
  }

  async function playAgain(): Promise<void> {
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

  async function claimHost(): Promise<void> {
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
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/net/localRoomClient.test.ts`
Expected: PASS, 7 tests.

If the assignability test fails to compile, the mismatch is a parameter list:
the local methods drop arguments they ignore, which TypeScript allows, but a
*return type* mismatch it does not. Fix the local signature, never the
`RoomClient` one.

- [ ] **Step 5: Verify the whole suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/net/localRoomClient.ts src/net/localRoomClient.test.ts
git commit -m "feat: an in-memory room client, so a game can be played alone"
```

---

### Task 3: Let a one-player room start

`Lobby` hard-codes a two-player minimum. Without this the solo button reaches a lobby it can never leave.

**Files:**
- Modify: `src/ui/Lobby.tsx:6-12` (props), `:59`, `:62`
- Modify: `src/ui/Lobby.test.tsx`

**Interfaces:**
- Produces: `LobbyProps.minPlayers?: number`, defaulting to `2`. Task 4 passes `1` in solo mode.

- [ ] **Step 1: Write the failing test**

`src/ui/Lobby.test.tsx` already has a module-level `room` const and a test
named `'start button only for host, needs 2+ players'` whose last assertion
builds a one-player `solo` room and expects the button disabled. **Leave that
test exactly as it is** — it is now the proof that the default did not move.

Add one new test after it, inside the same `describe('Lobby')`:

```tsx
  test('minPlayers of 1 lets a one-player room start', () => {
    const onStart = vi.fn()
    const solo: Room = { ...room, players: { h: room.players.h } }
    render(
      <Lobby room={solo} shareUrl="u" isHost={true} minPlayers={1} onStart={onStart} />,
    )
    const start = screen.getByRole('button', { name: 'התחל משחק' })
    expect(start).toBeEnabled()
    start.click()
    expect(onStart).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/Lobby.test.tsx`
Expected: the `minPlayers` test FAILS — the button is disabled; TypeScript also rejects the unknown prop.

- [ ] **Step 3: Implement**

In `src/ui/Lobby.tsx`, add to `LobbyProps`:

```tsx
  /** Below this many players the game cannot start. Two for a real room —
   *  a one-player game is a solo test room, not something to share a link to. */
  minPlayers?: number
```

Destructure with the default: `export default function Lobby({ room, shareUrl, isHost, minPlayers = 2, onStart }: LobbyProps) {`

Replace line 59 `disabled={players.length < 2}` with `disabled={players.length < minPlayers}`, and line 62 `{players.length >= 2 && <Marks />}` with `{players.length >= minPlayers && <Marks />}`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/Lobby.test.tsx`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Lobby.tsx src/ui/Lobby.test.tsx
git commit -m "feat: Lobby takes a minPlayers floor, so a solo room can start"
```

---

### Task 4: Wire solo into App

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `createLocalRoomClient` (Task 2), `minPlayers` (Task 3)
- Produces: nothing other tasks import. Task 6 drives the `משחק מקומי` button.

- [ ] **Step 1: Add the state and the session**

Add to the imports:

```tsx
import { createLocalRoomClient } from './net/localRoomClient'
```

and `useMemo` to the React import.

Add module constants beside `isValidRoom`:

```tsx
const SOLO_UID = 'solo'
const SOLO_NAME = 'שחקן מקומי'
```

Inside `App`, after the existing `useState` calls:

```tsx
  const [solo, setSolo] = useState(false)
  const [soloCode, setSoloCode] = useState<string | null>(null)
  const localClient = useMemo(() => (solo ? createLocalRoomClient(SOLO_UID) : null), [solo])
```

- [ ] **Step 2: Replace `uid` with a session**

`const uid = user?.uid ?? null` becomes:

```tsx
  // The Firebase uid, which is what the RTDB client is keyed on — null in solo
  // mode, so that effect never runs.
  const fbUid = user?.uid ?? null

  /* One shape for "who is playing and through which client", so the two modes
     are symmetric rather than one being a set of ternaries bolted onto the
     other. Everything below reads from here. */
  const session =
    solo && localClient
      ? { uid: SOLO_UID, displayName: SOLO_NAME, client: localClient }
      : user && client
        ? { uid: user.uid, displayName: user.displayName, client }
        : null
  const activeCode = solo ? soloCode : code
```

- [ ] **Step 3: Point the effects at the session**

In the effect that builds the RTDB client, change `if (!uid)` to `if (!fbUid)`, `createRoomClient(db, uid)` to `createRoomClient(db, fbUid)`, and the dependency array `[uid]` to `[fbUid]`.

In the `watchRoom` effect, replace `client`/`code` with `session?.client`/`activeCode`:

```tsx
  useEffect(() => {
    setJoinError(null)
    const active = session?.client
    if (!active || !activeCode) {
      setRoom(null)
      return
    }
    return active.watchRoom(activeCode, setRoom)
  }, [session?.client, activeCode])
```

Replace the `joined` derivation and the presence effect:

```tsx
  const validRoom = isValidRoom(room) ? room : null
  const joined = !!(session && validRoom?.players?.[session.uid])

  useEffect(() => {
    const active = session?.client
    if (active && activeCode && joined) {
      active.setupPresence(activeCode)
      return () => active.teardownPresence()
    }
  }, [session?.client, activeCode, joined])
```

In the host-engine effect, replace the guard and every `client`/`code`/`uid`:

```tsx
  useEffect(() => {
    const active = session?.client
    if (!active || !activeCode || !validRoom || !session || !joined || busyRef.current) return
    const run = async (job: Promise<void>) => { /* unchanged */ }
    const storedHost = validRoom.players[validRoom.hostUid]
    if ((!storedHost || !storedHost.online) && eligibleHost(validRoom.players) === session.uid) {
      void run(active.claimHost(activeCode))
      return
    }
    if (validRoom.hostUid !== session.uid) return
    const action = hostAction(validRoom, now)
    if (action.type === 'close') void run(active.closeRound(activeCode, currentRoundIndex(validRoom)))
    else if (action.type === 'next') void run(active.startNextRound(activeCode, validRoom))
    else if (action.type === 'finish') void run(active.finishGame(activeCode))
  }, [session, activeCode, validRoom, joined, now])
```

- [ ] **Step 4: Gate the auth screens and add the door**

Wrap the two auth gates so solo skips them, and add the dev-only button inside the sign-in screen's `.spacer` div, directly after the existing Google button:

Change `if (!authReady)` and `if (!user)` to sit inside `if (!solo) { ... }`,
leaving both returns otherwise byte-identical. Then, in the sign-in screen's
`<div className="spacer">`, immediately after the closing `</button>` of the
`התחברות עם Google` button, insert:

```tsx
            {import.meta.env.DEV && (
              <button
                className="btn btn-block"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => setSolo(true)}
              >
                משחק מקומי
              </button>
            )}
```

and after the closing brace of `if (!solo) { ... }`, replace the existing
`if (!client) return <div className="screen">מתחברים…</div>` with:

```tsx
  if (!session) return <div className="screen">מתחברים…</div>
```

Keep the `isConfigured()` screen where it is, above all of this.

- [ ] **Step 5: Branch `createAndEnter` and pass the rest through**

```tsx
  const createAndEnter = async (name: string, config: RoomConfig) => {
    if (solo) {
      // No hash: `codeFromHash` would reject a made-up code, and a real one in
      // the URL would survive a reload that solo state does not.
      setSoloCode(await session.client.createRoom(config, name))
      return
    }
    void session.client.cleanupStaleRooms()
    const newCode = await session.client.createRoom(config, name)
    window.location.hash = `#${newCode}`
  }
```

Then replace every remaining `code`, `client` and `uid` below this point with `activeCode`, `session.client` and `session.uid`; `defaultName` becomes `session.displayName ?? ''`; and the `Lobby` call gains `minPlayers={solo ? 1 : 2}`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: both clean. **`src/App.test.tsx` must pass untouched.** It mocks
`./firebase` with a signed-in user and `./net/roomClient` with a fake client,
so it drives the non-solo branch of `session` end to end — which makes it the
regression test for this whole refactor. If it fails, the session derivation
changed real-room behaviour and the fix belongs in `App.tsx`, never in the test.

It does not mock `./net/localRoomClient`, and does not need to: with `solo`
false the `useMemo` never calls it, and the module imports nothing from
Firebase, so importing it in jsdom is inert.

- [ ] **Step 7: Verify by hand**

Run: `npm run dev`, open `http://localhost:5173/eretz-game/`, click `משחק מקומי`, create a 3-round game, and play it to the podium.
Expected: lobby starts with one player; confirming a guess closes the round at once; reveal shows the answer and one score row; the third round ends on the final screen.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: dev-only solo mode, playing the real loop against memory"
```

---

### Task 5: Prove the gate holds in the bundle

`import.meta.env.DEV` becomes `false` in a production build and the branch *should* be dead-code-eliminated. That is an assumption about Rolldown, and it is the whole claim of "dev only".

**Files:**
- Create: `scripts/check-bundle.mjs`
- Modify: `package.json` (the `build` script)

**Interfaces:**
- Produces: a build that exits non-zero if the local client reaches `dist`.

- [ ] **Step 1: Write the checker**

Create `scripts/check-bundle.mjs`:

```js
// Fails the build if dev-only code reached the production bundle.
//
// `createLocalRoomClient` is behind `import.meta.env.DEV`, which Vite
// substitutes with `false` so the branch and its import are dead code. That is
// Rolldown's behaviour, not a guarantee in the code, and the day it changes
// nothing else would notice — so it is asserted here rather than assumed.

import { readdir, readFile } from 'node:fs/promises'

const DIST = new URL('../dist/assets/', import.meta.url)
const FORBIDDEN = ['createLocalRoomClient']

const files = (await readdir(DIST)).filter((f) => f.endsWith('.js'))
if (files.length === 0) throw new Error('no bundle in dist/assets — did vite build run?')

const found = []
for (const file of files) {
  const source = await readFile(new URL(file, DIST), 'utf8')
  for (const needle of FORBIDDEN) if (source.includes(needle)) found.push(`${file}: ${needle}`)
}

if (found.length) {
  console.error(`dev-only code in the production bundle:\n  ${found.join('\n  ')}`)
  process.exit(1)
}
console.log(`bundle check — ${files.length} file(s), no dev-only code`)
```

- [ ] **Step 2: Wire it into the build**

In `package.json`, change the `build` script to:

```json
"build": "tsc --noEmit && vite build && node scripts/check-bundle.mjs",
```

- [ ] **Step 3: Run it and watch it pass**

Run: `npm run build`
Expected: the vite summary, then `bundle check — 1 file(s), no dev-only code`.

If it FAILS, the branch was not eliminated. The fix is to make the import lazy
rather than to weaken the check — in `App.tsx`, replace the static import with
`const { createLocalRoomClient } = await import('./net/localRoomClient')` behind
the button's click handler, holding the client in state instead of `useMemo`.

- [ ] **Step 4: Prove the check can fail**

Temporarily add `console.log('createLocalRoomClient')` to `src/main.tsx`, run `npm run build`, and confirm it exits non-zero naming the file. Then remove the line and re-run to confirm it passes again.

A check nobody has watched fail is not a check.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-bundle.mjs package.json
git commit -m "build: fail if dev-only solo code reaches the production bundle"
```

---

### Task 6: The solo E2E spec

This is the only end-to-end path the project has while the Google sign-in flow is broken.

**Files:**
- Create: `e2e/solo.spec.ts`

**Interfaces:**
- Consumes: the `משחק מקומי` button (Task 4).

- [ ] **Step 1: Write the spec**

Create `e2e/solo.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

/* The solo path: no Google popup, no Firebase, no emulator. It covers the
   client-side loop — lobby, round, guess, reveal, scoring, the podium — and
   that the map draws. It does NOT cover the RTDB writes, the rules, presence
   or host migration, which only smoke.spec.ts reaches. */

const ROUNDS = 3 // the floor Landing validates: rounds >= 3, seconds >= 10

/** Guessing immediately is what keeps this spec short: `shouldClose` fires
 *  once every online player has guessed, and solo has exactly one. */
async function guessAndConfirm(page: Page): Promise<void> {
  await page.locator('.map').click()
  await expect(page.getByText('נקודה סומנה · ניתן לתקן עד לאישור')).toBeVisible()
  await page.getByRole('button', { name: 'אישור' }).click()
}

test('a solo game plays through to the podium', async ({ page }) => {
  const detail = page.waitForResponse(
    (r) => r.url().endsWith('geo-detail.json') && r.status() === 200,
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'משחק מקומי' }).click()

  await page.getByLabel('כינוי').fill('בודק')
  await page.getByLabel('סבבים', { exact: true }).fill(String(ROUNDS))
  await page.getByLabel('שניות לסבב', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'צור חדר' }).click()

  await expect(page.getByText('חדר המתנה')).toBeVisible()
  await page.getByRole('button', { name: 'התחל משחק' }).click()

  for (let round = 1; round <= ROUNDS; round++) {
    await expect(page.getByText(`סבב ${round} / ${ROUNDS}`)).toBeVisible()
    await expect(page.locator('.locality-name')).not.toBeEmpty()
    await guessAndConfirm(page)

    // The round closes on the guess, not on the clock.
    await expect(page.getByText(`סבב ${round} · תוצאה`)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('table.scores tbody tr')).toHaveCount(1)
    await expect(page.locator('table.scores tbody td.num.muted')).toContainText('ק״מ')
  }

  await expect(page.locator('.crown')).toContainText('בודק')
  await expect(page.locator('.podium .slot')).toHaveCount(1)

  // The roadmap: the detail layer was fetched, and the plate's canvas strata
  // are on the map.
  await detail
  await expect(page.locator('.map canvas.leaflet-zoom-animated')).toHaveCount(3)
})
```

- [ ] **Step 2: Run it against a plain dev server**

Run: `npx playwright test e2e/solo.spec.ts`
Expected: PASS, with no emulator and no Java.

The spec's own web server is started by `playwright.config.ts` with
`VITE_USE_EMULATOR=1`, which makes `firebase.ts` call
`connectDatabaseEmulator` against nothing. Solo touches neither the database
nor auth, so this should be inert. **If it is not** — if the run hangs or the
console shows Firebase errors that block the button — the fix is a `webServer`
that drops that variable, not a change to solo mode.

- [ ] **Step 3: Confirm the canvas count**

If `toHaveCount(3)` fails, read the actual count off the failure and reconcile it against `MapView.tsx`, which creates three panes (`plate`, `detail`, `over`) each holding one canvas. A count of 2 means the detail fetch had not landed — move the `await detail` above the assertion. Do not relax the assertion to `toBeVisible()`; the point is that all three strata exist.

- [ ] **Step 4: Run it the way CI does**

Run: `npm run test:e2e`
Expected: `solo.spec.ts` PASSES and `smoke.spec.ts` FAILS at the Google popup, exactly as it does on `main`. The suite is red overall; that is pre-existing and not this branch's to fix.

- [ ] **Step 5: Commit**

```bash
git add e2e/solo.spec.ts
git commit -m "test: an end-to-end solo game, the one path not behind Google sign-in"
```

---

## Self-review notes

- **Spec coverage.** Every section of the spec maps to a task: the seam and the local client → Task 2; the extraction → Task 1; the App wiring, the session and the door → Task 4; the dev-only build claim → Task 5; the unit and e2e testing → Tasks 1, 2, 3, 6. The one thing the spec does not contain is Task 3, which planning turned up and which is recorded under "Spec deviation found during planning" above.
- **Type consistency.** `newRoundData(room, startedAt)` is used with that signature in Tasks 1 and 2. `minPlayers` is named identically in Tasks 3 and 4. `session.client` / `session.uid` / `activeCode` are introduced in Task 4 Step 2 and used with those names through Step 5.
- **Known gap left open deliberately.** The Google sign-in failure in `smoke.spec.ts` is out of scope, so `npm run test:e2e` stays red. Task 6 Step 4 states the expected result rather than pretending otherwise.
