# מלך הארץ אונליין (Eretz Game)

משחק גיאוגרפיה מקוון למספר שחקנים, בהשראת התוכנית "מלך הארץ": שחקן אחד פותח
חדר ומשתף קישור הזמנה (למשל בוואטסאפ), ובכל סבב מוכרז שם יישוב ישראלי אקראי —
וכל שחקן צריך להצביע על מיקומו במפה תוך זמן מוגבל. הניקוד ניתן לפי הקרבה
למיקום האמיתי, והשחקן/ית עם הניקוד המצטבר הגבוה ביותר בסוף כל הסבבים מנצח/ת.

A free, browser-based multiplayer geography game for friends and family: one
player opens a room and shares an invite link, each round names a random
Israeli locality, and everyone taps a map of Israel to guess where it is.
Points are scored by proximity; highest total after all rounds wins. It's a
static site (no server code) — React + Leaflet on the frontend, Firebase
Realtime Database for sync, hosted free on GitHub Pages.

## 1. One-time Firebase setup (~5 minutes)

These are the only manual steps needed to bring the game online. All of it is
free (Spark plan).

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
   — free **Spark** plan, disable Google Analytics for the project.
2. **Build → Authentication → Sign-in method** → enable **Anonymous**.
3. **Build → Realtime Database → Create database** → choose the **Belgium
   (europe-west1)** region → start in **locked mode**.
4. **Realtime Database → Rules** tab → paste the contents of
   [`database.rules.json`](./database.rules.json) → **Publish**.
5. **Project settings → General → Your apps → Web app (`</>`)** → copy the
   generated config object into [`src/firebase-config.ts`](./src/firebase-config.ts),
   replacing the `PASTE_ME` placeholders.

The Firebase web config is public client config by design (it's committed to
the repo) — the security boundary is the rules file, not secrecy of the
config.

## 2. One-time GitHub setup

1. Create a GitHub repo named **`eretz-game`** (the name must match `base` in
   [`vite.config.ts`](./vite.config.ts); if you pick a different repo name,
   change `base` to match), and push `main` to it.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` — the deploy workflow
   ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)) builds
   and publishes the site automatically. It appears at
   `https://<user>.github.io/eretz-game/`.

## 3. Local development

With a real Firebase project configured (steps above):

```bash
npm run dev
```

Or fully offline, against the Firebase emulator (no real Firebase project
needed):

```bash
npm run emu                              # terminal 1: starts the RTDB + Auth emulators
VITE_USE_EMULATOR=1 npm run dev          # terminal 2: dev server, pointed at the emulator
```

## 4. Tests

```bash
npm test          # unit tests (Vitest)
npm run test:emu  # security rules + client code against the Firebase emulator
                   # (needs Java: brew install openjdk)
npm run test:e2e  # Playwright smoke test — two players play a round end to end
```

## 5. Refreshing locality data

```bash
npm run build:data
```

Regenerates [`src/data/localities.json`](./src/data/localities.json) from the
official CBS (למ"ס) locality list on
[data.gov.il](https://data.gov.il) (resource
`d47a54ff-87f0-44b3-b33a-f284c0c38e5a`). The generated JSON is committed to
the repo — run this and commit the result whenever the source data changes.

## 6. Known trade-off

There is no server: the current round's answer lives in the shared Realtime
Database, so a player with dev tools open could in principle peek at it. This
is an accepted trade-off for a free, serverless, casual game among friends —
not something worth solving with a backend.
