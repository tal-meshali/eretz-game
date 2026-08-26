# Eretz Game — Multiplayer "מלך הארץ" — Design Spec

**Date:** 2026-08-26
**Status:** Approved by user

## Overview

A free, browser-based multiplayer geography game inspired by the Israeli TV show
'מלך הארץ'. One player opens a room and shares an invite link (e.g. via
WhatsApp). Each round, a random Israeli locality is announced by name; every
player has a limited time to tap the spot on a map of Israel where they believe
it is. Points are awarded by proximity to the true location. Highest total after
all rounds wins.

- **Audience:** friends & family — rooms of 2–10 players, a handful of
  concurrent games at most.
- **Language:** Hebrew-first UI, RTL layout, Hebrew locality names.
- **Cost:** free hosting end to end (GitHub Pages + Firebase free tier).

## Architecture

Static single-page app, no server code anywhere.

| Concern | Choice |
| --- | --- |
| Frontend | Vite + TypeScript + React |
| Map | Leaflet, Esri World Imagery tiles (satellite, **no labels**), viewport locked to Israel bounds |
| Realtime sync | Firebase Realtime Database (Spark free tier), Firebase anonymous auth |
| Hosting | GitHub Pages, deployed via GitHub Actions on push |
| Tests | Vitest (unit), Firebase emulator (rules/state machine), Playwright (smoke flow) |

All clients read/write shared room state in RTDB; Firebase security rules
constrain writes. The Firebase web config is committed to the repo (it is
public by design; rules are the security boundary).

**Known trade-off (accepted):** with no server, the current round's answer is
present in the shared database, so a player with dev-tools open could cheat.
Acceptable for a casual friends-and-family game; the answer is lightly
obfuscated but not cheat-proof.

## Localities data

- Source: official CBS (למ"ס) locality list from data.gov.il — Hebrew name,
  coordinates (converted ITM → WGS84 if needed), population.
- A build-time script generates a bundled `localities.json`.
- Difficulty tiers, selected by the room creator, filter by population:
  - **קל** — population ≥ 20,000 (~80 well-known cities)
  - **בינוני** — population ≥ 5,000 (~200 towns and large kibbutzim)
  - **קשה** — all recognized localities (~1,200)

## Game flow

1. **Landing** — create a room (nickname, difficulty, number of rounds
   [default 10], seconds per round [default 20]) or join one via link. A room
   gets a short code carried in the URL hash (`…/#ABCD`); the lobby shows a
   copy-link and WhatsApp-share button.
2. **Lobby** — live player list; the host presses התחל.
3. **Round** — the locality name is shown prominently with a countdown.
   Tapping the map drops the player's pin; it can be adjusted until the player
   presses אישור or time expires. Other players' pins are not visible during
   the round.
4. **Reveal** — the true location is shown along with every player's pin
   (name, distance in km, points earned), followed by an interim leaderboard.
   Host advances to the next round; auto-advance after 8 seconds.
5. **Final** — podium and total scores; "משחק חוזר" starts a new game in the
   same room with the same players.

## Scoring

`points = round(1000 × e^(−distance_km / 30))`

≈1000 for a bullseye, ~370 at 30 km, effectively 0 beyond ~150 km. Distance is
haversine, from the player's pin to the locality's coordinates. No guess by the
deadline = 0 points for the round. Highest cumulative score wins.

## Realtime model & edge cases

- **Identity:** Firebase anonymous auth UID + user-chosen nickname.
- **Room state (RTDB, sketch):**
  `rooms/{code}` → config (rounds, seconds, difficulty), state
  (lobby/playing/finished), host UID, `players/{uid}` (name, joinedAt, score),
  current round (index, locality, startedAt), `guesses/{round}/{uid}`
  (lat, lng, timestamp).
- **Timer fairness:** round deadlines derive from the round's `startedAt`
  server timestamp plus Firebase's `.info/serverTimeOffset`, so wrong phone
  clocks don't matter.
- **Round advancement:** the host's client advances state when all players
  have guessed or time is up.
- **Host leaves:** host role auto-migrates to the earliest-joined remaining
  player; the game never dies.
- **Refresh / reconnect:** all state lives in the DB, so reloading resumes the
  game seamlessly.
- **Mid-game joiners:** enter at the next round; 0 points for missed rounds.
- **Stale rooms:** room creation opportunistically deletes rooms older than
  24 hours; security rules only permit deleting rooms past that age. Keeps the
  free tier tidy without a server.

## Testing

- **Vitest:** scoring formula, haversine distance, difficulty filtering,
  room-code generation.
- **Firebase emulator:** security rules and the room state machine
  (create → join → start → guess → reveal → advance → finish, host migration).
- **Playwright smoke test:** two browser contexts play a full short game
  against the emulator.

## Deployment

- GitHub repository; GitHub Actions workflow builds with Vite and deploys to
  GitHub Pages on every push to `main`.
- One-time manual step for the owner: create the free Firebase project, enable
  anonymous auth + Realtime Database, and paste the web config into the repo.
