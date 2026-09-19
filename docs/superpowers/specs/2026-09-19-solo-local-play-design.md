# Solo local play — design

**Date:** 2026-09-19
**Status:** approved (Tal, 2026-09-19)

## Why

The only door into the game is Google sign-in against the live `eretz-king`
project, and the only way to see a round is to get a second person (or a second
browser profile) into a room. Testing anything past the landing page — the
round loop, the reveal, the scoreboard, and now the rebuilt roadmap — costs
more setup than the thing being tested.

The Playwright smoke test, which was the one automated path through all of
that, currently fails at the Google account-chooser popup. Confirmed on an
unmodified `main` (4e404d4) in a clean worktree on 2026-09-18, so it is not a
regression from any branch in hand. Until it is fixed the project has no
end-to-end coverage at all.

A solo mode fixes the manual cost directly and the automated gap as a
consequence.

## Scope

Decided with Tal, 2026-09-19:

- **One player.** No bots. The reveal and scoreboard render a single row, and
  that is accepted — this is scaffolding for exercising the loop, not a
  single-player feature.
- **No Firebase, no sign-in.** The room lives in memory.
- **Dev only.** Present on the dev server and under Playwright, absent from the
  GitHub Pages build.

Explicitly not in scope: bot players, a practice mode for real players, any
change to how a real multiplayer room works, and fixing the Google sign-in
failure (separate problem, noted above so nobody mistakes it for fallout).

## Architecture

### The seam already exists

`RoomClient` is `ReturnType<typeof createRoomClient>` — a duck-typed interface
of thirteen methods. Everything above it is already pure over a `Room`:
`phaseOf`, `hostAction`, `scoresFor`, `eligibleHost` in `game/derive.ts`, and
every view. The host engine in `App.tsx` is a `useEffect` driven by a 4 Hz
clock tick that calls `hostAction(room, now)` and dispatches to the client.

So solo mode changes **where the room lives** and nothing else. The loop it
exercises is the real loop, not a parallel one — which is the property that
makes it worth testing against.

### `src/net/localRoomClient.ts`

`createLocalRoomClient(uid)` returns a value structurally assignable to
`RoomClient`. It holds one `Room` in a closure plus a `Set` of subscribers;
every mutation replaces the room object and notifies each subscriber.

| Method | Local behaviour |
| --- | --- |
| `createRoom(config, hostName)` | Builds the `Room` with one player, returns a code from `generateRoomCode()` |
| `joinRoom` | No-op — the single player is created by `createRoom` |
| `watchRoom(code, cb)` | Registers `cb`, calls it immediately with the current room, returns an unsubscribe |
| `setupPresence` / `teardownPresence` | No-ops; the player is always `online: true` |
| `startGame` / `submitGuess` / `closeRound` / `startNextRound` / `finishGame` / `playAgain` / `claimHost` | The same mutations the Firebase client performs, applied in memory |
| `cleanupStaleRooms` | No-op |

`Date.now()` stands in for `serverTimestamp()`.

`serverNow()` needs no change: it is `Date.now() + offsetMs`, and with
`watchServerOffset` never running in solo mode the offset stays 0.

### One extraction

`newRound()` is currently a closure inside `createRoomClient` and picks the
locality via `pickLocalityId(poolFor(difficulty), used)`. Both clients need it,
and if the two copies drift, solo mode stops being a faithful test of the real
one — which is the only reason it is worth having.

It moves to `src/game/rounds.ts` as `newRoundData(room, startedAt)`. The
timestamp is a parameter because it is the single thing the two modes disagree
about: the Firebase client passes `serverTimestamp()`, the local client passes
`Date.now()`.

### Wiring into `App.tsx`

`App` gains `solo` state and derives one `session` rather than threading a
ternary through every site that reads `uid` or `client`:

`SOLO_UID` is the literal `'solo'` and `SOLO_NAME` is `'שחקן מקומי'`, both
module constants in `App.tsx`.

```ts
const session = solo
  ? { uid: SOLO_UID, displayName: SOLO_NAME, client: localClient }
  : user && client
    ? { uid: user.uid, displayName: user.displayName, client }
    : null
```

The host-engine effect, the presence effect and every render path read from
`session`, so the two modes are symmetric instead of one being bolted onto the
other. The effect that constructs the RTDB client is keyed on the Firebase
`uid`, which is `null` in solo mode, so it already no-ops.

**The room code lives in React state, not in the location hash.** The hash
route was considered and rejected: `codeFromHash` validates against
`ABCDEFGHJKMNPQRSTUVWXYZ`, which excludes I, L and O, so a fixed literal like
`SOLO` is not a valid code — the hash route would need either a real generated
code in the URL or a change to the code grammar. Keeping the code in state
avoids both, and means a reload lands cleanly back on the sign-in screen
instead of trying to join a real room by that name.

### The door

A `משחק מקומי` button under the sign-in screen, behind `import.meta.env.DEV`.

Vite substitutes `import.meta.env.DEV` with `false` in a production build, so
the branch and its import are dead code that Rolldown should drop.
**"Should" is not "does"** — the build check in the testing section below
asserts it rather than assuming it.

## Error handling

There is almost none to design: the local client cannot fail. Its methods
return already-resolved promises, so `App`'s `busyRef` guard and every `await`
behave exactly as they do against Firebase.

The one case worth naming is `isValidRoom` in `App.tsx`, which exists because a
real room doc can transiently hold only a `players` subtree. The local client
never produces that shape, so the guard simply always passes — it is left
alone rather than bypassed for solo, because a second code path around it is
a second thing that can disagree with the real one.

## Testing

### Unit — `src/net/localRoomClient.test.ts`

The client is synchronous and pure, so it tests directly:

- create → lobby → start → guess → close → next → finish → `playAgain` returns
  to lobby with rounds and guesses cleared
- `watchRoom` fires on every mutation, and its unsubscribe stops delivery
- a locality never repeats within a game (the `used` list reaches
  `pickLocalityId`)
- `hostAction` over the in-memory room produces the same sequence it produces
  over an equivalent literal room — the assertion that solo drives the real
  engine

### Unit — `src/game/rounds.test.ts`

Covers the extracted `newRoundData` once, for both callers.

### Build — the dev-only gate

`scripts/check-bundle.mjs`, run as the last step of `npm run build`: it greps
the built `dist/assets/*.js` for `createLocalRoomClient` and exits non-zero if
it finds it. A node script rather than a vitest case, because the thing under
test is a build artifact and the unit suite must not depend on one having been
produced. Failing the build is the point — this is the whole claim of "dev
only", and it is the kind of claim that silently stops being true.

### E2E — `e2e/solo.spec.ts`

Plays a full game with no Google popup and no Firebase:

1. `goto('/')`, click `משחק מקומי`
2. fill the nickname, set rounds to 3 and seconds to 10, create the room
   (3 is the floor `Landing` validates — `rounds >= 3 && rounds <= 20`,
   `seconds >= 10 && seconds <= 60` — so a shorter game cannot be configured)
3. lobby → start
4. round: assert the locality name and the countdown are shown; click the map;
   assert the pin appears; confirm
5. reveal: assert the answer target, a distance in km and a points row
6. rounds two and three, then the final screen with a total

**A solo round closes the moment the guess is confirmed**, and the spec
depends on it for its runtime. `shouldClose` returns true once every online
player has guessed; with one player that is immediate, so a round costs a
click plus the 8 s `REVEAL_MS` rather than the full 10 s timer. Three rounds
land near 30 s, inside Playwright's 60 s default. Worth asserting directly as
well — it is real behaviour of `derive.ts`, not an accident of the harness.

It also asserts the map itself renders, which is what gives the rebuilt
roadmap end-to-end cover: the plate's canvas panes exist, and
`geo-detail.json` is requested and answers 200.

**Honest limits of this spec.** It exercises the client-side game loop and the
map. It does NOT exercise the RTDB writes, the security rules, presence, or
host migration — everything the local client stubs out. The smoke test is
still the only thing that covers those, and it is still failing, so
`npm run test:e2e` stays red overall until sign-in is fixed. This spec makes
the loop testable; it does not make the suite green.

The solo spec has no emulator dependency, so it should also pass standalone via
`npx playwright test e2e/solo.spec.ts` with no Java and no emulator running.
Worth confirming during implementation: `playwright.config.ts` boots its web
server with `VITE_USE_EMULATOR=1`, which makes `firebase.ts` call
`connectDatabaseEmulator` at module load against a server that is not there.
Solo touches neither the database nor auth, so this is expected to be inert —
but it is an assumption, not a fact, until it is run.

## Files

| File | Change |
| --- | --- |
| `src/net/localRoomClient.ts` | New — the in-memory client |
| `src/game/rounds.ts` | New — `newRoundData` extracted from `createRoomClient` |
| `src/net/roomClient.ts` | Uses the extracted `newRoundData` |
| `src/App.tsx` | `solo` state, the `session` derivation, the dev-only button |
| `src/net/localRoomClient.test.ts` | New |
| `src/game/rounds.test.ts` | New |
| `e2e/solo.spec.ts` | New |
| `scripts/check-bundle.mjs` | New — fails the build if the local client reaches `dist` |
| `package.json` | `build` runs the bundle check after `vite build` |
