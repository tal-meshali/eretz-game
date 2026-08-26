# Eretz Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiplayer "מלך הארץ" geography game — rooms with invite links, guess Israeli localities on a map, points by proximity — as a static site on GitHub Pages synced through Firebase Realtime Database.

**Architecture:** Vite + React + TypeScript SPA. All game state lives in Firebase RTDB under `rooms/{code}`; every client derives the UI phase from that state with pure functions, and the host's client (with automatic host migration) is the only writer of round transitions. Localities are a build-time-generated JSON bundled into the app.

**Tech Stack:** React 18, TypeScript, Vite, Leaflet (plain, no react-leaflet), Firebase JS SDK v10+ (RTDB + anonymous auth), Vitest + @testing-library/react, Firebase emulator (needs Java), Playwright.

## Global Constraints

- Repo root: `/Users/talmeshali/Code/eretz-game` (git repo already initialized, spec committed).
- Node ≥ 20 (machine has v24.19.0), npm. No yarn/pnpm.
- All user-facing text is Hebrew; `index.html` sets `<html lang="he" dir="rtl">`.
- Vite `base: '/eretz-game/'` (GitHub Pages project site).
- Localities source: data.gov.il CKAN datastore, resource id `d47a54ff-87f0-44b3-b33a-f284c0c38e5a` (CBS קובץ היישובים 2023; 1,484 rows, 1,221 with coords+population). The generated `src/data/localities.json` is **committed** so builds never hit the API.
- Coordinates in that resource are ITM (EPSG:2039) packed as 12 digits: first 6 = easting (m), last 6 = northing (m).
- Difficulty tiers by population: easy ≥ 20,000 (98 places), medium ≥ 5,000 (193), hard = all (1,221).
- Scoring: `points = Math.round(1000 * Math.exp(-distanceKm / 30))`, haversine distance, R = 6371 km.
- Room codes: 4 chars from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ` (no I/L/O), carried in URL hash `#ABCD`.
- Defaults: 10 rounds, 20 seconds per round, difficulty easy. Reveal auto-advances after 8,000 ms.
- Firebase emulator requires Java. It is NOT installed on this machine; Task 7 installs it via `brew install openjdk` (no sudo) and wires PATH inside npm scripts.
- Map tiles: Esri World Imagery (satellite, no labels): `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`. Use `L.circleMarker` for all pins (no PNG icon assets).
- Commit after every task (message style: `feat: …`, `test: …`, `chore: …`).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/scaffold.test.ts`, `.gitignore`

**Interfaces:**
- Produces: an `npm test` (vitest) and `npm run build` pipeline every later task relies on. `App` is a placeholder replaced in Task 12.

- [ ] **Step 1: Scaffold with npm**

```bash
cd /Users/talmeshali/Code/eretz-game
npm init -y
npm i react react-dom leaflet firebase
npm i -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/user-event @types/react @types/react-dom @types/leaflet
```

- [ ] **Step 2: Write config files**

`package.json` — replace `scripts` with:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Also set `"type": "module"`.

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/eretz-game/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
```

Note: `test` key needs the vitest types — add at top: `/// <reference types="vitest/config" />`.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

Note: `scripts/` is deliberately NOT in the tsconfig — `tsc --noEmit` must not try to type-check the `.ts` test that imports an untyped `.mjs` module. Vitest still runs `scripts/*.test.ts` (esbuild transform, no tsc).

`.gitignore`:

```
node_modules/
dist/
.firebase/
firebase-debug.log
database-debug.log
test-results/
playwright-report/
```

`index.html`:

```html
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <title>מלך הארץ אונליין</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import 'leaflet/dist/leaflet.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/App.tsx` (placeholder, replaced in Task 12):

```tsx
export default function App() {
  return <h1>מלך הארץ אונליין</h1>
}
```

`src/styles.css` (base only; extended in Task 9):

```css
:root {
  --bg: #0e1a26;
  --card: #16283a;
  --text: #f2f6fa;
  --muted: #93a8bb;
  --accent: #2eb886;
  --danger: #e05555;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Heebo', sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
button {
  font: inherit; border: 0; border-radius: 10px; padding: 10px 18px;
  background: var(--accent); color: #fff; cursor: pointer;
}
button:disabled { opacity: 0.45; cursor: default; }
input, select {
  font: inherit; border-radius: 10px; border: 1px solid #2c4257;
  background: #0b1420; color: var(--text); padding: 10px;
}
```

- [ ] **Step 3: Write a trivial failing test to prove vitest runs**

`src/scaffold.test.ts`:

```ts
import { expect, test } from 'vitest'

test('scaffold sanity', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 4: Run tests and build**

Run: `npm test` — Expected: 1 passed.
Run: `npm run build` — Expected: builds `dist/` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + React + TS + Vitest project"
```

---

### Task 2: Localities build script and dataset

**Files:**
- Create: `scripts/localities-lib.mjs` (pure logic), `scripts/build-localities.mjs` (fetch + write), `scripts/localities-lib.test.ts`, `src/data/localities.json` (generated, committed)

**Interfaces:**
- Produces: `src/data/localities.json` — JSON array of `{ id: number, name: string, lat: number, lng: number, pop: number }`, consumed by Task 4 (`src/game/localities.ts`). Also `itmToWgs84(east, north): {lat, lng}` and `recordsToLocalities(records): Locality[]` in `scripts/localities-lib.mjs`.

- [ ] **Step 1: Install proj4 (build-time only)**

```bash
npm i -D proj4
```

- [ ] **Step 2: Write the failing tests**

`scripts/localities-lib.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { itmToWgs84, parsePackedCoord, recordsToLocalities } from './localities-lib.mjs'

describe('parsePackedCoord', () => {
  test('splits 12-digit packed ITM into east/north', () => {
    expect(parsePackedCoord(174014614251)).toEqual({ east: 174014, north: 614251 })
  })
  test('rejects malformed values', () => {
    expect(parsePackedCoord(null)).toBeNull()
    expect(parsePackedCoord(1234)).toBeNull()
  })
})

describe('itmToWgs84', () => {
  test('converts Azrieli Center Tel Aviv area to correct WGS84', () => {
    // ITM ~(179254, 664323) is the Azrieli Center: ~32.074N, 34.792E
    const { lat, lng } = itmToWgs84(179254, 664323)
    expect(lat).toBeCloseTo(32.074, 2)
    expect(lng).toBeCloseTo(34.792, 2)
  })
})

describe('recordsToLocalities', () => {
  const rec = (over: Record<string, unknown>) => ({
    'סמל יישוב': 5000,
    'שם יישוב': 'תל אביב -יפו',
    'סך הכל אוכלוסייה 2023 - ארעי': 474530,
    'קואורדינטות': 178690663900,
    ...over,
  })
  test('maps a valid record and trims the name', () => {
    const out = recordsToLocalities([rec({ 'שם יישוב': ' תל אביב -יפו ' })])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(5000)
    expect(out[0].name).toBe('תל אביב -יפו')
    expect(out[0].pop).toBe(474530)
    expect(out[0].lat).toBeGreaterThan(29.4)
    expect(out[0].lat).toBeLessThan(33.4)
    expect(out[0].lng).toBeGreaterThan(34.2)
    expect(out[0].lng).toBeLessThan(35.95)
  })
  test('drops records missing coords or population', () => {
    expect(recordsToLocalities([rec({ 'קואורדינטות': null })])).toHaveLength(0)
    expect(recordsToLocalities([rec({ 'סך הכל אוכלוסייה 2023 - ארעי': null })])).toHaveLength(0)
  })
  test('finds the population field by prefix even if the year changes', () => {
    const r = rec({})
    delete (r as Record<string, unknown>)['סך הכל אוכלוסייה 2023 - ארעי']
    ;(r as Record<string, unknown>)['סך הכל אוכלוסייה 2024 - ארעי'] = 1234
    expect(recordsToLocalities([r])[0].pop).toBe(1234)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run scripts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement the library**

`scripts/localities-lib.mjs`:

```js
import proj4 from 'proj4'

// EPSG:2039 — Israeli Transverse Mercator (רשת ישראל החדשה)
const ITM =
  '+proj=tmerc +lat_0=31.734393611 +lon_0=35.204516944 +k=1.0000067 ' +
  '+x_0=219529.584 +y_0=626907.39 +ellps=GRS80 ' +
  '+towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs'

export function parsePackedCoord(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const s = String(value)
  if (s.length !== 12) return null
  return { east: Number(s.slice(0, 6)), north: Number(s.slice(6)) }
}

export function itmToWgs84(east, north) {
  const [lng, lat] = proj4(ITM, proj4.WGS84, [east, north])
  return { lat, lng }
}

const IN_ISRAEL = ({ lat, lng }) =>
  lat > 29.4 && lat < 33.4 && lng > 34.2 && lng < 35.95

export function recordsToLocalities(records) {
  if (records.length === 0) return []
  const out = []
  for (const r of records) {
    const popKey = Object.keys(r).find((k) => k.startsWith('סך הכל אוכלוסייה'))
    const pop = popKey ? r[popKey] : null
    const packed = parsePackedCoord(r['קואורדינטות'])
    const id = r['סמל יישוב']
    const name = typeof r['שם יישוב'] === 'string' ? r['שם יישוב'].trim() : ''
    if (!packed || typeof pop !== 'number' || !pop || !id || !name) continue
    const { lat, lng } = itmToWgs84(packed.east, packed.north)
    if (!IN_ISRAEL({ lat, lng })) continue
    out.push({
      id,
      name,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      pop,
    })
  }
  return out
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run scripts` — Expected: PASS (all).

- [ ] **Step 6: Write the fetch script**

`scripts/build-localities.mjs`:

```js
import { writeFileSync, mkdirSync } from 'node:fs'
import { recordsToLocalities } from './localities-lib.mjs'

const RESOURCE = 'd47a54ff-87f0-44b3-b33a-f284c0c38e5a'
const URL = `https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCE}&limit=5000`

const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
if (!res.ok) throw new Error(`data.gov.il returned ${res.status}`)
const body = await res.json()
if (!body.success) throw new Error('CKAN API reported failure')
const records = body.result.records
if (records.length < body.result.total) {
  throw new Error(`pagination needed: got ${records.length} of ${body.result.total}`)
}

const localities = recordsToLocalities(records)
if (localities.length < 1100) {
  throw new Error(`suspiciously few localities: ${localities.length}`)
}
localities.sort((a, b) => a.id - b.id)

mkdirSync('src/data', { recursive: true })
writeFileSync('src/data/localities.json', JSON.stringify(localities))
console.log(`wrote ${localities.length} localities`)
console.log(`easy(>=20k): ${localities.filter((l) => l.pop >= 20000).length}`)
console.log(`medium(>=5k): ${localities.filter((l) => l.pop >= 5000).length}`)
```

Add to `package.json` scripts: `"build:data": "node scripts/build-localities.mjs"`.

- [ ] **Step 7: Run it and sanity-check the output**

Run: `npm run build:data`
Expected: `wrote ~1221 localities`, `easy(>=20k): ~98`, `medium(>=5k): ~193` (±5 is fine — the dataset updates).

Run: `node -e "const l=require('./src/data/localities.json'); const ta=l.find(x=>x.id===5000); console.log(ta); if(Math.abs(ta.lat-32.07)>0.15||Math.abs(ta.lng-34.78)>0.15) process.exit(1)"`
Expected: prints Tel Aviv-Yafo (`סמל יישוב` 5000) near lat 32.07, lng 34.78; exit 0.

- [ ] **Step 8: Commit (including the generated JSON)**

```bash
git add -A && git commit -m "feat: CBS localities dataset build script + bundled localities.json"
```

---

### Task 3: Scoring — haversine distance and points

**Files:**
- Create: `src/game/score.ts`, `src/game/score.test.ts`

**Interfaces:**
- Produces: `haversineKm(a: LatLng, b: LatLng): number` and `pointsFor(distanceKm: number): number` where `LatLng = { lat: number; lng: number }`. Consumed by Tasks 6, 11.

- [ ] **Step 1: Write the failing tests**

`src/game/score.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { haversineKm, pointsFor } from './score'

const JERUSALEM = { lat: 31.7683, lng: 35.2137 }
const TEL_AVIV = { lat: 32.0853, lng: 34.7818 }

describe('haversineKm', () => {
  test('zero for identical points', () => {
    expect(haversineKm(JERUSALEM, JERUSALEM)).toBe(0)
  })
  test('Jerusalem to Tel Aviv is ~54 km', () => {
    const d = haversineKm(JERUSALEM, TEL_AVIV)
    expect(d).toBeGreaterThan(50)
    expect(d).toBeLessThan(58)
  })
  test('symmetric', () => {
    expect(haversineKm(JERUSALEM, TEL_AVIV)).toBeCloseTo(haversineKm(TEL_AVIV, JERUSALEM), 10)
  })
})

describe('pointsFor', () => {
  test('bullseye gives 1000', () => {
    expect(pointsFor(0)).toBe(1000)
  })
  test('30 km gives ~368', () => {
    expect(pointsFor(30)).toBe(368)
  })
  test('monotonically decreasing', () => {
    expect(pointsFor(10)).toBeGreaterThan(pointsFor(11))
  })
  test('far guesses approach 0', () => {
    expect(pointsFor(300)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/score.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/game/score.ts`:

```ts
export interface LatLng {
  lat: number
  lng: number
}

const R = 6371 // km
const rad = (deg: number) => (deg * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function pointsFor(distanceKm: number): number {
  return Math.round(1000 * Math.exp(-distanceKm / 30))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/score.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game && git commit -m "feat: haversine distance and proximity scoring"
```

---

### Task 4: Locality pool — difficulty tiers and random pick

**Files:**
- Create: `src/game/localities.ts`, `src/game/localities.test.ts`

**Interfaces:**
- Consumes: `src/data/localities.json` (Task 2).
- Produces:
  - `interface Locality { id: number; name: string; lat: number; lng: number; pop: number }`
  - `type Difficulty = 'easy' | 'medium' | 'hard'`
  - `poolFor(difficulty: Difficulty, all?: Locality[]): Locality[]`
  - `pickLocalityId(pool: Locality[], usedIds: number[], rand?: () => number): number`
  - `localityById(id: number, all?: Locality[]): Locality` (throws if unknown)
  - `DIFFICULTY_LABELS: Record<Difficulty, string>` — Hebrew labels `קל / בינוני / קשה`

- [ ] **Step 1: Write the failing tests**

`src/game/localities.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { localityById, pickLocalityId, poolFor, type Locality } from './localities'

const fake: Locality[] = [
  { id: 1, name: 'עיר גדולה', lat: 32, lng: 34.8, pop: 100000 },
  { id: 2, name: 'עיירה', lat: 31.5, lng: 34.9, pop: 8000 },
  { id: 3, name: 'מושב קטן', lat: 33, lng: 35.5, pop: 400 },
]

describe('poolFor', () => {
  test('easy = pop >= 20000', () => {
    expect(poolFor('easy', fake).map((l) => l.id)).toEqual([1])
  })
  test('medium = pop >= 5000', () => {
    expect(poolFor('medium', fake).map((l) => l.id)).toEqual([1, 2])
  })
  test('hard = everything', () => {
    expect(poolFor('hard', fake)).toHaveLength(3)
  })
  test('real dataset tiers have sane sizes', () => {
    expect(poolFor('easy').length).toBeGreaterThan(80)
    expect(poolFor('medium').length).toBeGreaterThan(150)
    expect(poolFor('hard').length).toBeGreaterThan(1100)
  })
})

describe('pickLocalityId', () => {
  test('never returns a used id', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickLocalityId(fake, [1, 3])).toBe(2)
    }
  })
  test('deterministic with injected rand', () => {
    expect(pickLocalityId(fake, [], () => 0)).toBe(1)
    expect(pickLocalityId(fake, [], () => 0.99)).toBe(3)
  })
  test('falls back to allowing repeats when pool is exhausted', () => {
    expect([1, 2, 3]).toContain(pickLocalityId(fake, [1, 2, 3]))
  })
})

describe('localityById', () => {
  test('finds by id', () => {
    expect(localityById(2, fake).name).toBe('עיירה')
  })
  test('throws on unknown id', () => {
    expect(() => localityById(999, fake)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/localities.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/game/localities.ts`:

```ts
import raw from '../data/localities.json'

export interface Locality {
  id: number
  name: string
  lat: number
  lng: number
  pop: number
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
}

const ALL = raw as Locality[]

const MIN_POP: Record<Difficulty, number> = { easy: 20000, medium: 5000, hard: 0 }

export function poolFor(difficulty: Difficulty, all: Locality[] = ALL): Locality[] {
  return all.filter((l) => l.pop >= MIN_POP[difficulty])
}

export function pickLocalityId(
  pool: Locality[],
  usedIds: number[],
  rand: () => number = Math.random,
): number {
  const used = new Set(usedIds)
  const fresh = pool.filter((l) => !used.has(l.id))
  const from = fresh.length > 0 ? fresh : pool
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))].id
}

export function localityById(id: number, all: Locality[] = ALL): Locality {
  const found = all.find((l) => l.id === id)
  if (!found) throw new Error(`unknown locality id ${id}`)
  return found
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/localities.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game && git commit -m "feat: locality pools by difficulty and no-repeat random pick"
```

---

### Task 5: Room codes

**Files:**
- Create: `src/game/roomCodes.ts`, `src/game/roomCodes.test.ts`

**Interfaces:**
- Produces: `generateRoomCode(rand?: () => number): string`, `isValidRoomCode(s: string): boolean`, `codeFromHash(hash: string): string | null`. Consumed by Tasks 7, 12.

- [ ] **Step 1: Write the failing tests**

`src/game/roomCodes.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { codeFromHash, generateRoomCode, isValidRoomCode } from './roomCodes'

describe('generateRoomCode', () => {
  test('4 chars from the safe alphabet', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
    }
  })
  test('deterministic with injected rand', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAA')
  })
})

describe('isValidRoomCode', () => {
  test('accepts generated codes', () => {
    expect(isValidRoomCode('ABCD')).toBe(true)
  })
  test('rejects wrong length, excluded letters, lowercase', () => {
    expect(isValidRoomCode('ABC')).toBe(false)
    expect(isValidRoomCode('ABIO')).toBe(false)
    expect(isValidRoomCode('abcd')).toBe(false)
  })
})

describe('codeFromHash', () => {
  test('parses "#ABCD" and normalizes case', () => {
    expect(codeFromHash('#ABCD')).toBe('ABCD')
    expect(codeFromHash('#abcd')).toBe('ABCD')
  })
  test('returns null for empty or invalid hash', () => {
    expect(codeFromHash('')).toBeNull()
    expect(codeFromHash('#')).toBeNull()
    expect(codeFromHash('#TOOLONG')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/roomCodes.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/game/roomCodes.ts`:

```ts
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_RE = new RegExp(`^[${ALPHABET}]{4}$`)

export function generateRoomCode(rand: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(rand() * ALPHABET.length))]
  }
  return code
}

export function isValidRoomCode(s: string): boolean {
  return CODE_RE.test(s)
}

export function codeFromHash(hash: string): string | null {
  const candidate = hash.replace(/^#/, '').toUpperCase()
  return isValidRoomCode(candidate) ? candidate : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/roomCodes.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game && git commit -m "feat: room code generation and parsing"
```

---

### Task 6: Shared types and the pure game-state derivations

This is the heart of the design: clients never store derived state in the DB. Everything — current phase, scores, whose turn to act — is computed from the raw `Room` object by pure functions, so all clients agree and there are no write races.

**Files:**
- Create: `src/types.ts`, `src/game/derive.ts`, `src/game/derive.test.ts`

**Interfaces:**
- Consumes: `haversineKm`, `pointsFor` (Task 3); `localityById`, `Locality`, `Difficulty` (Task 4).
- Produces (`src/types.ts`):

```ts
import type { Difficulty } from './game/localities'

export interface RoomConfig {
  rounds: number
  seconds: number
  difficulty: Difficulty
}

export interface Player {
  name: string
  joinedAt: number
  online: boolean
}

export interface RoundData {
  localityId: number
  startedAt: number
  revealAt?: number
}

export interface Guess {
  lat: number
  lng: number
  at: number
}

export interface Room {
  createdAt: number
  hostUid: string
  state: 'lobby' | 'playing' | 'finished'
  config: RoomConfig
  players: Record<string, Player>
  rounds?: (RoundData | null)[] // RTDB returns numeric-keyed objects as arrays
  guesses?: Record<number, Record<string, Guess>>
}
```

- Produces (`src/game/derive.ts`) — exact signatures later tasks call:
  - `REVEAL_MS = 8000`
  - `currentRoundIndex(room: Room): number` — `-1` when no rounds
  - `currentRound(room: Room): RoundData | null`
  - `phaseOf(room: Room): 'lobby' | 'guessing' | 'reveal' | 'finished'`
  - `deadlineOf(round: RoundData, config: RoomConfig): number`
  - `shouldClose(room: Room, nowMs: number): boolean`
  - `hostAction(room: Room, nowMs: number): { type: 'close' | 'next' | 'finish' | 'none' }`
  - `eligibleHost(players: Record<string, Player>): string | null`
  - `scoresFor(room: Room, all?: Locality[]): Record<string, PlayerScore>` where `PlayerScore = { total: number; byRound: ({ distanceKm: number; points: number } | null)[] }` (entry `null` = no guess that round; only **revealed** rounds are counted)

- [ ] **Step 1: Write `src/types.ts`** exactly as in the Interfaces block above.

- [ ] **Step 2: Write the failing tests**

`src/game/derive.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Room } from '../types'
import {
  REVEAL_MS,
  currentRoundIndex,
  deadlineOf,
  eligibleHost,
  hostAction,
  phaseOf,
  scoresFor,
  shouldClose,
} from './derive'
import type { Locality } from './localities'

const LOCS: Locality[] = [
  { id: 10, name: 'א', lat: 32.0, lng: 34.8, pop: 50000 },
  { id: 20, name: 'ב', lat: 31.5, lng: 34.9, pop: 50000 },
]

function room(over: Partial<Room> = {}): Room {
  return {
    createdAt: 1000,
    hostUid: 'h',
    state: 'lobby',
    config: { rounds: 2, seconds: 20, difficulty: 'easy' },
    players: {
      h: { name: 'מארח', joinedAt: 1000, online: true },
      p: { name: 'שחקן', joinedAt: 2000, online: true },
    },
    ...over,
  }
}

const T0 = 100_000

describe('phaseOf / currentRoundIndex', () => {
  test('lobby', () => {
    expect(phaseOf(room())).toBe('lobby')
    expect(currentRoundIndex(room())).toBe(-1)
  })
  test('guessing while round open', () => {
    const r = room({ state: 'playing', rounds: [{ localityId: 10, startedAt: T0 }] })
    expect(phaseOf(r)).toBe('guessing')
    expect(currentRoundIndex(r)).toBe(0)
  })
  test('reveal once revealAt set', () => {
    const r = room({
      state: 'playing',
      rounds: [{ localityId: 10, startedAt: T0, revealAt: T0 + 5000 }],
    })
    expect(phaseOf(r)).toBe('reveal')
  })
  test('finished', () => {
    expect(phaseOf(room({ state: 'finished' }))).toBe('finished')
  })
})

describe('deadlineOf / shouldClose', () => {
  const playing = (guesses: Room['guesses']) =>
    room({ state: 'playing', rounds: [{ localityId: 10, startedAt: T0 }], guesses })
  test('deadline = startedAt + seconds', () => {
    expect(deadlineOf({ localityId: 10, startedAt: T0 }, room().config)).toBe(T0 + 20000)
  })
  test('closes when time is up', () => {
    expect(shouldClose(playing(undefined), T0 + 20001)).toBe(true)
    expect(shouldClose(playing(undefined), T0 + 5000)).toBe(false)
  })
  test('closes early when every online player guessed', () => {
    const g = { lat: 32, lng: 34.8, at: T0 + 1 }
    expect(shouldClose(playing({ 0: { h: g, p: g } }), T0 + 5000)).toBe(true)
    expect(shouldClose(playing({ 0: { h: g } }), T0 + 5000)).toBe(false)
  })
  test('offline players are not waited for', () => {
    const g = { lat: 32, lng: 34.8, at: T0 + 1 }
    const r = playing({ 0: { h: g } })
    r.players.p.online = false
    expect(shouldClose(r, T0 + 5000)).toBe(true)
  })
})

describe('hostAction', () => {
  test('none in lobby', () => {
    expect(hostAction(room(), T0).type).toBe('none')
  })
  test('close when round should close', () => {
    const r = room({ state: 'playing', rounds: [{ localityId: 10, startedAt: T0 }] })
    expect(hostAction(r, T0 + 21000).type).toBe('close')
  })
  test('next after reveal window on a non-final round', () => {
    const r = room({
      state: 'playing',
      rounds: [{ localityId: 10, startedAt: T0, revealAt: T0 + 20000 }],
    })
    expect(hostAction(r, T0 + 20000 + REVEAL_MS - 1).type).toBe('none')
    expect(hostAction(r, T0 + 20000 + REVEAL_MS + 1).type).toBe('next')
  })
  test('finish after reveal window on the final round', () => {
    const r = room({
      state: 'playing',
      rounds: [
        { localityId: 10, startedAt: T0, revealAt: T0 + 20000 },
        { localityId: 20, startedAt: T0 + 30000, revealAt: T0 + 50000 },
      ],
    })
    expect(hostAction(r, T0 + 50000 + REVEAL_MS + 1).type).toBe('finish')
  })
})

describe('eligibleHost', () => {
  test('earliest-joined online player', () => {
    expect(eligibleHost(room().players)).toBe('h')
    const p = room().players
    p.h.online = false
    expect(eligibleHost(p)).toBe('p')
  })
  test('null when everyone is offline', () => {
    const p = room().players
    p.h.online = false
    p.p.online = false
    expect(eligibleHost(p)).toBeNull()
  })
})

describe('scoresFor', () => {
  test('scores revealed rounds only, missing guess = null entry and 0 points', () => {
    const r = room({
      state: 'playing',
      rounds: [
        { localityId: 10, startedAt: T0, revealAt: T0 + 20000 },
        { localityId: 20, startedAt: T0 + 30000 }, // still open — not scored
      ],
      guesses: {
        0: { h: { lat: 32.0, lng: 34.8, at: T0 + 1 } }, // bullseye for h, nothing for p
        1: { p: { lat: 31.5, lng: 34.9, at: T0 + 30001 } },
      },
    })
    const s = scoresFor(r, LOCS)
    expect(s.h.total).toBe(1000)
    expect(s.h.byRound[0]!.points).toBe(1000)
    expect(s.h.byRound[0]!.distanceKm).toBeCloseTo(0, 5)
    expect(s.p.total).toBe(0)
    expect(s.p.byRound[0]).toBeNull()
    expect(s.h.byRound).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/game/derive.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement**

`src/game/derive.ts`:

```ts
import type { Player, Room, RoomConfig, RoundData } from '../types'
import { haversineKm, pointsFor } from './score'
import { localityById, type Locality } from './localities'

export const REVEAL_MS = 8000

export function currentRoundIndex(room: Room): number {
  return (room.rounds?.length ?? 0) - 1
}

export function currentRound(room: Room): RoundData | null {
  const i = currentRoundIndex(room)
  return i >= 0 ? (room.rounds![i] ?? null) : null
}

export function phaseOf(room: Room): 'lobby' | 'guessing' | 'reveal' | 'finished' {
  if (room.state === 'lobby') return 'lobby'
  if (room.state === 'finished') return 'finished'
  const round = currentRound(room)
  if (!round) return 'lobby'
  return round.revealAt ? 'reveal' : 'guessing'
}

export function deadlineOf(round: RoundData, config: RoomConfig): number {
  return round.startedAt + config.seconds * 1000
}

export function shouldClose(room: Room, nowMs: number): boolean {
  const round = currentRound(room)
  if (room.state !== 'playing' || !round || round.revealAt) return false
  if (nowMs > deadlineOf(round, room.config)) return true
  const i = currentRoundIndex(room)
  const roundGuesses = room.guesses?.[i] ?? {}
  const online = Object.keys(room.players).filter((uid) => room.players[uid].online)
  return online.length > 0 && online.every((uid) => roundGuesses[uid] != null)
}

export function hostAction(room: Room, nowMs: number): { type: 'close' | 'next' | 'finish' | 'none' } {
  if (room.state !== 'playing') return { type: 'none' }
  const round = currentRound(room)
  if (!round) return { type: 'none' }
  if (!round.revealAt) return shouldClose(room, nowMs) ? { type: 'close' } : { type: 'none' }
  if (nowMs <= round.revealAt + REVEAL_MS) return { type: 'none' }
  const isLast = currentRoundIndex(room) + 1 >= room.config.rounds
  return { type: isLast ? 'finish' : 'next' }
}

export function eligibleHost(players: Record<string, Player>): string | null {
  const online = Object.entries(players).filter(([, p]) => p.online)
  if (online.length === 0) return null
  online.sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || ua.localeCompare(ub))
  return online[0][0]
}

export interface PlayerScore {
  total: number
  byRound: ({ distanceKm: number; points: number } | null)[]
}

export function scoresFor(room: Room, all?: Locality[]): Record<string, PlayerScore> {
  const out: Record<string, PlayerScore> = {}
  for (const uid of Object.keys(room.players)) out[uid] = { total: 0, byRound: [] }
  const rounds = room.rounds ?? []
  rounds.forEach((round, i) => {
    if (!round || !round.revealAt) return
    const target = localityById(round.localityId, all)
    for (const uid of Object.keys(room.players)) {
      const guess = room.guesses?.[i]?.[uid]
      if (!guess) {
        out[uid].byRound.push(null)
        continue
      }
      const distanceKm = haversineKm(guess, target)
      const points = pointsFor(distanceKm)
      out[uid].byRound.push({ distanceKm, points })
      out[uid].total += points
    }
  })
  return out
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/game/derive.test.ts` — Expected: PASS.
Run: `npm test` — Expected: everything so far PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/game && git commit -m "feat: pure room-state derivations (phase, deadlines, host actions, scoring)"
```

---

### Task 7: Firebase infrastructure, security rules, and rules tests

Requires Java for the emulator — not installed on this machine; installed here via Homebrew (no sudo).

**Files:**
- Create: `firebase.json`, `database.rules.json`, `src/firebase-config.ts`, `src/firebase.ts`, `vitest.emu.config.ts`, `src/net/rules.emu.test.ts`
- Modify: `package.json` (scripts), `vite.config.ts` (exclude `*.emu.test.ts` from the default run)

**Interfaces:**
- Produces: `db` (RTDB `Database`), `auth`, `ensureSignedIn(): Promise<string>` (resolves uid), `isConfigured(): boolean` from `src/firebase.ts`; committed security rules; npm script `test:emu` that runs all `*.emu.test.ts` files under the emulator. Consumed by Tasks 8 and 12.
- **Trust model (documented, accepted in spec):** any signed-in (anonymous) user may write room state/config/rounds — friends don't grief each other. The rules DO hard-enforce: auth required for everything, players write only their own player node, a guess is write-once and only by its owner, rooms are deletable only after 24 h.

- [ ] **Step 1: Install Java + firebase tooling**

```bash
brew install openjdk
npm i -D firebase-tools @firebase/rules-unit-testing
/opt/homebrew/opt/openjdk/bin/java -version
```

Expected: java version prints. (Do NOT try to symlink into /Library — that needs sudo. npm scripts below prepend the brew path.)

- [ ] **Step 2: Write emulator + rules config**

`firebase.json`:

```json
{
  "database": { "rules": "database.rules.json" },
  "emulators": {
    "database": { "port": 9000 },
    "auth": { "port": 9099 },
    "ui": { "enabled": false }
  }
}
```

`database.rules.json`:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      ".read": "auth != null",
      ".indexOn": ["createdAt"],
      "$code": {
        ".write": "auth != null && ((!data.exists() && newData.exists()) || (!newData.exists() && data.child('createdAt').val() < now - 86400000))",
        "state": { ".write": "auth != null" },
        "config": { ".write": "auth != null" },
        "hostUid": { ".write": "auth != null" },
        "rounds": { ".write": "auth != null" },
        "players": {
          "$uid": { ".write": "auth != null && auth.uid === $uid" }
        },
        "guesses": {
          ".write": "auth != null && !newData.exists()",
          "$round": {
            "$uid": { ".write": "auth != null && auth.uid === $uid && !data.exists()" }
          }
        }
      }
    }
  }
}
```

Why this shape: RTDB write grants cascade downward, so the room root only grants **create** and **delete-if-stale**; every mutable child gets its own rule. `guesses` root-level `.write` permits only deletion (the "משחק חוזר" reset); individual guesses are write-once per owner.

- [ ] **Step 3: Write the app-side Firebase module**

`src/firebase-config.ts` (placeholder the owner replaces after creating their Firebase project — see Task 14 README):

```ts
// Replace with your Firebase web app config (Console → Project settings → Your apps).
// This is public client config; security lives in database.rules.json.
export const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'PASTE_ME.firebaseapp.com',
  databaseURL: 'https://PASTE_ME-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'PASTE_ME',
  appId: 'PASTE_ME',
}
```

`src/firebase.ts`:

```ts
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { firebaseConfig } from './firebase-config'

const useEmulator = !!import.meta.env.VITE_USE_EMULATOR

const config = useEmulator
  ? { ...firebaseConfig, projectId: 'demo-eretz', apiKey: 'demo', databaseURL: 'https://demo-eretz-default-rtdb.firebaseio.com' }
  : firebaseConfig

export const app = initializeApp(config)
export const db = getDatabase(app)
export const auth = getAuth(app)

if (useEmulator) {
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}

export function isConfigured(): boolean {
  return useEmulator || firebaseConfig.apiKey !== 'PASTE_ME'
}

export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid
  const cred = await signInAnonymously(auth)
  return cred.user.uid
}
```

- [ ] **Step 4: Wire the emulator test lane**

`vitest.emu.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.emu.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
})
```

In `vite.config.ts`, extend the default test excludes so `npm test` skips emulator suites:

```ts
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', 'e2e/**', '**/*.emu.test.ts'],
  },
```

Add to `package.json` scripts (PATH prefix makes brew's Java visible to the emulator):

```json
"test:emu": "PATH=\"/opt/homebrew/opt/openjdk/bin:$PATH\" firebase emulators:exec --only database,auth --project demo-eretz 'vitest run --config vitest.emu.config.ts'"
```

- [ ] **Step 5: Write the failing rules tests**

`src/net/rules.emu.test.ts`:

```ts
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
})
```

- [ ] **Step 6: Run — first proving the lane itself works**

Run: `npm test` — Expected: PASS and the emu suite is NOT in the run.
Run: `npm run test:emu` — Expected: emulator downloads on first run, then all rules tests PASS. (If a rules test fails, fix `database.rules.json`, not the test — the behaviors above are the contract.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Firebase wiring, RTDB security rules, emulator rules tests"
```

---

### Task 8: roomClient — all RTDB reads/writes

**Files:**
- Create: `src/net/roomClient.ts`, `src/net/serverTime.ts`, `src/net/roomClient.emu.test.ts`

**Interfaces:**
- Consumes: `db`, `ensureSignedIn` (Task 7); `generateRoomCode` (Task 5); `poolFor`, `pickLocalityId` (Task 4); types (Task 6).
- Produces: `createRoomClient(db: Database, uid: string): RoomClient` with methods (exact signatures):
  - `createRoom(config: RoomConfig, hostName: string): Promise<string>` — resolves room code
  - `joinRoom(code: string, name: string): Promise<void>` — rejects with `Error('room-not-found')`
  - `watchRoom(code: string, cb: (room: Room | null) => void): () => void`
  - `setupPresence(code: string): void`
  - `startGame(code: string, room: Room): Promise<void>`
  - `submitGuess(code: string, roundIndex: number, guess: { lat: number; lng: number }): Promise<void>`
  - `closeRound(code: string, roundIndex: number): Promise<void>`
  - `startNextRound(code: string, room: Room): Promise<void>`
  - `finishGame(code: string): Promise<void>`
  - `playAgain(code: string): Promise<void>`
  - `claimHost(code: string): Promise<void>`
  - `cleanupStaleRooms(): Promise<void>`
- Produces (`src/net/serverTime.ts`): `watchServerOffset(db: Database): () => void` and `serverNow(): number` — wall-clock corrected by RTDB `.info/serverTimeOffset`.

- [ ] **Step 1: Write `src/net/serverTime.ts`**

```ts
import { onValue, ref, type Database } from 'firebase/database'

let offsetMs = 0

export function watchServerOffset(db: Database): () => void {
  return onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    offsetMs = snap.val() ?? 0
  })
}

export function serverNow(): number {
  return Date.now() + offsetMs
}
```

- [ ] **Step 2: Write the failing integration tests**

`src/net/roomClient.emu.test.ts` — two real anonymous users against the emulator. Helper creates an isolated app per user:

```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:emu` — Expected: rules tests still PASS, roomClient tests FAIL (module not found).

- [ ] **Step 4: Implement**

`src/net/roomClient.ts`:

```ts
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
```

- [ ] **Step 5: Run to verify green**

Run: `npm run test:emu` — Expected: ALL emulator suites PASS.
Run: `npm test && npm run build` — Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/net package.json && git commit -m "feat: roomClient RTDB operations with emulator integration tests"
```

---

### Task 9: MapView — Leaflet wrapper

**Files:**
- Create: `src/ui/MapView.tsx`, `src/ui/MapView.test.tsx`
- Modify: `src/styles.css` (append layout styles)

**Interfaces:**
- Produces:

```tsx
export interface Pin {
  lat: number
  lng: number
  label: string
  color: string // css color for the circle marker
  kind: 'guess' | 'answer'
}
export interface MapViewProps {
  pins?: Pin[]
  onPick?: (p: { lat: number; lng: number }) => void // absent/undefined = map is read-only
  onMapReady?: (map: L.Map) => void // used by tests and by RevealView to fit bounds
}
```

Consumed by Tasks 11–12. Satellite tiles per Global Constraints; `L.circleMarker` pins (answer: bigger, `--accent` green; guesses: player colors) with permanent tooltips for labels.

- [ ] **Step 1: Write the failing test**

`src/ui/MapView.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type * as L from 'leaflet'
import MapView from './MapView'

function mount(props: Parameters<typeof MapView>[0] = {}) {
  let map: L.Map | null = null
  const utils = render(<MapView {...props} onMapReady={(m) => (map = m)} />)
  return { map: map! as L.Map, ...utils }
}

describe('MapView', () => {
  test('initializes a leaflet map centered on Israel', () => {
    const { map } = mount()
    expect(map).toBeTruthy()
    const c = map.getCenter()
    expect(c.lat).toBeGreaterThan(29)
    expect(c.lat).toBeLessThan(34)
  })

  test('click fires onPick with latlng', () => {
    const onPick = vi.fn()
    const { map } = mount({ onPick })
    map.fire('click', { latlng: { lat: 32.1, lng: 34.9 } })
    expect(onPick).toHaveBeenCalledWith({ lat: 32.1, lng: 34.9 })
  })

  test('no onPick → clicks ignored', () => {
    const { map } = mount()
    expect(() => map.fire('click', { latlng: { lat: 32, lng: 35 } })).not.toThrow()
  })

  test('renders a circle marker per pin', () => {
    const { map } = mount({
      pins: [
        { lat: 32, lng: 34.8, label: 'אני', color: '#3388ff', kind: 'guess' },
        { lat: 31.5, lng: 34.9, label: 'תשובה', color: '#2eb886', kind: 'answer' },
      ],
    })
    let count = 0
    map.eachLayer((l) => {
      if ((l as L.CircleMarker).getRadius) count++
    })
    expect(count).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/MapView.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/ui/MapView.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'

export interface Pin {
  lat: number
  lng: number
  label: string
  color: string
  kind: 'guess' | 'answer'
}

export interface MapViewProps {
  pins?: Pin[]
  onPick?: (p: { lat: number; lng: number }) => void
  onMapReady?: (map: L.Map) => void
}

const ISRAEL_BOUNDS = L.latLngBounds([29.3, 33.8], [33.5, 36.2])
const TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export default function MapView({ pins = [], onPick, onMapReady }: MapViewProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    const map = L.map(elRef.current!, {
      center: [31.5, 35.0],
      zoom: 8,
      minZoom: 7,
      maxZoom: 13,
      maxBounds: ISRAEL_BOUNDS.pad(0.3),
      attributionControl: false,
      zoomControl: false,
    })
    L.tileLayer(TILES).addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    pinLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    onMapReady?.(map)
    return () => {
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const layer = pinLayerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const pin of pins) {
      L.circleMarker([pin.lat, pin.lng], {
        radius: pin.kind === 'answer' ? 12 : 8,
        color: '#fff',
        weight: 2,
        fillColor: pin.color,
        fillOpacity: 0.95,
      })
        .bindTooltip(pin.label, { permanent: true, direction: 'top', className: 'pin-tip' })
        .addTo(layer)
    }
  }, [pins])

  return <div ref={elRef} className="map" />
}
```

Append to `src/styles.css`:

```css
#root, .screen { min-height: 100dvh; display: flex; flex-direction: column; }
.screen { padding: 16px; gap: 16px; max-width: 720px; margin: 0 auto; width: 100%; }
.card { background: var(--card); border-radius: 14px; padding: 16px; }
.map { flex: 1; min-height: 55dvh; border-radius: 14px; }
.pin-tip { background: rgba(0,0,0,0.75); color: #fff; border: 0; direction: rtl; }
.hud { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.locality-name { font-size: 1.7rem; font-weight: 800; margin: 0; }
.timebar { height: 8px; border-radius: 4px; background: #24384c; overflow: hidden; }
.timebar > div { height: 100%; background: var(--accent); transition: width 0.25s linear; }
.timebar.low > div { background: var(--danger); }
table.scores { width: 100%; border-collapse: collapse; }
table.scores td, table.scores th { padding: 8px; text-align: right; border-bottom: 1px solid #24384c; }
.podium { display: flex; gap: 10px; align-items: flex-end; justify-content: center; }
.podium .slot { background: var(--card); border-radius: 12px 12px 0 0; padding: 12px; text-align: center; flex: 1; }
.muted { color: var(--muted); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
label.field { display: flex; flex-direction: column; gap: 6px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/MapView.test.tsx` — Expected: PASS. (Leaflet runs under jsdom; if `window.matchMedia` errors appear, they are safe to ignore as long as assertions pass.)

- [ ] **Step 5: Commit**

```bash
git add src/ui src/styles.css && git commit -m "feat: Leaflet MapView with Israel bounds and circle-marker pins"
```

---

### Task 10: Landing and Lobby screens

**Files:**
- Create: `src/ui/Landing.tsx`, `src/ui/Lobby.tsx`, `src/ui/Landing.test.tsx`, `src/ui/Lobby.test.tsx`

**Interfaces:**
- Consumes: `DIFFICULTY_LABELS`, `Difficulty` (Task 4); types (Task 6).
- Produces:

```tsx
// Landing: create-or-join. joinCode != null → join mode (code came from URL hash).
interface LandingProps {
  joinCode: string | null
  onCreate: (name: string, config: RoomConfig) => void
  onJoin: (name: string) => void
}
// Lobby
interface LobbyProps {
  room: Room
  shareUrl: string
  isHost: boolean
  onStart: () => void
}
```

- [ ] **Step 1: Write the failing tests**

`src/ui/Landing.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Landing from './Landing'

describe('Landing — create mode', () => {
  test('submits name and config with defaults', async () => {
    const onCreate = vi.fn()
    render(<Landing joinCode={null} onCreate={onCreate} onJoin={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('כינוי'), 'טל')
    await userEvent.click(screen.getByRole('button', { name: 'צור חדר' }))
    expect(onCreate).toHaveBeenCalledWith('טל', { rounds: 10, seconds: 20, difficulty: 'easy' })
  })
  test('create button disabled without a name', () => {
    render(<Landing joinCode={null} onCreate={vi.fn()} onJoin={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'צור חדר' })).toBeDisabled()
  })
})

describe('Landing — join mode', () => {
  test('shows the room code and calls onJoin', async () => {
    const onJoin = vi.fn()
    render(<Landing joinCode="ABCD" onCreate={vi.fn()} onJoin={onJoin} />)
    expect(screen.getByText(/ABCD/)).toBeTruthy()
    await userEvent.type(screen.getByLabelText('כינוי'), 'דנה')
    await userEvent.click(screen.getByRole('button', { name: 'הצטרפות' }))
    expect(onJoin).toHaveBeenCalledWith('דנה')
  })
})
```

`src/ui/Lobby.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Lobby from './Lobby'
import type { Room } from '../types'

const room: Room = {
  createdAt: 1,
  hostUid: 'h',
  state: 'lobby',
  config: { rounds: 10, seconds: 20, difficulty: 'easy' },
  players: {
    h: { name: 'מארח', joinedAt: 1, online: true },
    p: { name: 'שחקן', joinedAt: 2, online: false },
  },
}

describe('Lobby', () => {
  test('lists players', () => {
    render(<Lobby room={room} shareUrl="https://x/#ABCD" isHost={false} onStart={vi.fn()} />)
    expect(screen.getByText('מארח')).toBeTruthy()
    expect(screen.getByText('שחקן')).toBeTruthy()
  })
  test('start button only for host, needs 2+ players', () => {
    const { rerender } = render(
      <Lobby room={room} shareUrl="u" isHost={false} onStart={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'התחל משחק' })).toBeNull()
    rerender(<Lobby room={room} shareUrl="u" isHost={true} onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'התחל משחק' })).toBeEnabled()
    const solo: Room = { ...room, players: { h: room.players.h } }
    rerender(<Lobby room={solo} shareUrl="u" isHost={true} onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'התחל משחק' })).toBeDisabled()
  })
})
```

Note: these use plain DOM assertions (`toBeDisabled` etc. need `@testing-library/jest-dom`): `npm i -D @testing-library/jest-dom`, create `src/test-setup.ts` with `import '@testing-library/jest-dom/vitest'` and add `setupFiles: ['src/test-setup.ts']` to the `test` block in `vite.config.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/Landing.test.tsx src/ui/Lobby.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/ui/Landing.tsx`:

```tsx
import { useState } from 'react'
import { DIFFICULTY_LABELS, type Difficulty } from '../game/localities'
import type { RoomConfig } from '../types'

interface LandingProps {
  joinCode: string | null
  onCreate: (name: string, config: RoomConfig) => void
  onJoin: (name: string) => void
}

export default function Landing({ joinCode, onCreate, onJoin }: LandingProps) {
  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [rounds, setRounds] = useState(10)
  const [seconds, setSeconds] = useState(20)
  const trimmed = name.trim()

  return (
    <div className="screen">
      <h1>מלך הארץ אונליין</h1>
      <div className="card">
        <label className="field">
          כינוי
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </label>
        {joinCode ? (
          <>
            <p>
              הוזמנת לחדר <b>{joinCode}</b>
            </p>
            <button disabled={!trimmed} onClick={() => onJoin(trimmed)}>
              הצטרפות
            </button>
          </>
        ) : (
          <>
            <div className="row">
              <label className="field">
                רמת קושי
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                סבבים
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                />
              </label>
              <label className="field">
                שניות לסבב
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                />
              </label>
            </div>
            <button disabled={!trimmed} onClick={() => onCreate(trimmed, { rounds, seconds, difficulty })}>
              צור חדר
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

`src/ui/Lobby.tsx`:

```tsx
import type { Room } from '../types'
import { DIFFICULTY_LABELS } from '../game/localities'

interface LobbyProps {
  room: Room
  shareUrl: string
  isHost: boolean
  onStart: () => void
}

export default function Lobby({ room, shareUrl, isHost, onStart }: LobbyProps) {
  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`בואו לשחק מלך הארץ! ${shareUrl}`)}`

  return (
    <div className="screen">
      <h1>חדר המתנה</h1>
      <div className="card">
        <p className="muted">
          {room.config.rounds} סבבים · {room.config.seconds} שניות · רמה:{' '}
          {DIFFICULTY_LABELS[room.config.difficulty]}
        </p>
        <div className="row">
          <button onClick={() => navigator.clipboard?.writeText(shareUrl)}>העתק קישור</button>
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <button>שתף בוואטסאפ</button>
          </a>
        </div>
      </div>
      <div className="card">
        <h2>שחקנים ({players.length})</h2>
        <ul>
          {players.map(([uid, p]) => (
            <li key={uid}>
              {p.name} {p.online ? '🟢' : '⚪'} {uid === room.hostUid ? '· מארח' : ''}
            </li>
          ))}
        </ul>
        {isHost && (
          <button disabled={players.length < 2} onClick={onStart}>
            התחל משחק
          </button>
        )}
        {!isHost && <p className="muted">ממתינים למארח שיתחיל…</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui` — Expected: PASS (MapView tests too).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: landing and lobby screens with invite sharing"
```

---

### Task 11: Round, Reveal, and Final screens

**Files:**
- Create: `src/ui/playerColors.ts`, `src/ui/RoundView.tsx`, `src/ui/RevealView.tsx`, `src/ui/FinalView.tsx`, `src/ui/playerColors.test.ts`, `src/ui/gameScreens.test.tsx`

**Interfaces:**
- Consumes: `MapView` + `Pin` (Task 9), derivations (Task 6), `localityById` (Task 4), `haversineKm`/`pointsFor` (Task 3).
- Produces:

```tsx
// playerColors.ts
export function playerColor(uid: string, room: Room): string // stable per player, from an 8-color palette by joinedAt order

// RoundView
interface RoundViewProps {
  room: Room
  nowMs: number
  myUid: string
  myGuess: Guess | null // my guess for the current round, or null
  onConfirm: (p: { lat: number; lng: number }) => void
  onMapReady?: (map: L.Map) => void // test hook, passed through to MapView
}

// RevealView
interface RevealViewProps { room: Room; nowMs: number; myUid: string }

// FinalView
interface FinalViewProps { room: Room; isHost: boolean; onPlayAgain: () => void }
```

- [ ] **Step 1: Write the failing tests**

`src/ui/playerColors.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { playerColor } from './playerColors'
import type { Room } from '../types'

const room = {
  players: {
    b: { name: 'ב', joinedAt: 2, online: true },
    a: { name: 'א', joinedAt: 1, online: true },
  },
} as unknown as Room

describe('playerColor', () => {
  test('stable and distinct by join order', () => {
    expect(playerColor('a', room)).toBe(playerColor('a', room))
    expect(playerColor('a', room)).not.toBe(playerColor('b', room))
  })
})
```

`src/ui/gameScreens.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as L from 'leaflet'
import RoundView from './RoundView'
import RevealView from './RevealView'
import FinalView from './FinalView'
import type { Room } from '../types'
import raw from '../data/localities.json'
import type { Locality } from '../game/localities'

const LOC = (raw as Locality[])[0]
const T0 = 100_000

function playingRoom(over: Partial<Room> = {}): Room {
  return {
    createdAt: 1,
    hostUid: 'h',
    state: 'playing',
    config: { rounds: 2, seconds: 20, difficulty: 'hard' },
    players: {
      h: { name: 'מארח', joinedAt: 1, online: true },
      p: { name: 'שחקן', joinedAt: 2, online: true },
    },
    rounds: [{ localityId: LOC.id, startedAt: T0 }],
    ...over,
  }
}

describe('RoundView', () => {
  test('shows locality name, round counter, and remaining seconds', () => {
    render(
      <RoundView room={playingRoom()} nowMs={T0 + 5000} myUid="p" myGuess={null} onConfirm={vi.fn()} />,
    )
    expect(screen.getByText(LOC.name)).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  test('confirm flows: disabled → pick on map → confirm calls onConfirm', async () => {
    const onConfirm = vi.fn()
    let map: L.Map | null = null
    render(
      <RoundView
        room={playingRoom()}
        nowMs={T0 + 5000}
        myUid="p"
        myGuess={null}
        onConfirm={onConfirm}
        onMapReady={(m) => (map = m)}
      />,
    )
    const btn = screen.getByRole('button', { name: 'אישור' })
    expect(btn).toBeDisabled()
    act(() => {
      map!.fire('click', { latlng: { lat: 32.1, lng: 34.9 } })
    })
    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    expect(onConfirm).toHaveBeenCalledWith({ lat: 32.1, lng: 34.9 })
  })

  test('after my guess is in, shows waiting state', () => {
    render(
      <RoundView
        room={playingRoom()}
        nowMs={T0 + 5000}
        myUid="p"
        myGuess={{ lat: 32, lng: 34.8, at: T0 + 1 }}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText(/ההימור נקלט/)).toBeInTheDocument()
  })
})

describe('RevealView', () => {
  test('shows the answer and per-player distance and points, best first', () => {
    const room = playingRoom({
      rounds: [{ localityId: LOC.id, startedAt: T0, revealAt: T0 + 20000 }],
      guesses: {
        0: {
          h: { lat: LOC.lat, lng: LOC.lng, at: T0 + 1 }, // bullseye
          p: { lat: LOC.lat + 0.5, lng: LOC.lng, at: T0 + 2 }, // ~55 km off
        },
      },
    })
    render(<RevealView room={room} nowMs={T0 + 21000} myUid="p" />)
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('מארח')
    expect(rows[0]).toHaveTextContent('1000')
    expect(rows[1]).toHaveTextContent('שחקן')
  })
})

describe('FinalView', () => {
  const finished = playingRoom({
    state: 'finished',
    rounds: [{ localityId: LOC.id, startedAt: T0, revealAt: T0 + 20000 }],
    guesses: { 0: { h: { lat: LOC.lat, lng: LOC.lng, at: T0 + 1 } } },
  })
  test('crowns the winner and lists totals', () => {
    render(<FinalView room={finished} isHost={false} onPlayAgain={vi.fn()} />)
    expect(screen.getByText(/מלך הארץ:/)).toHaveTextContent('מארח')
  })
  test('play-again button only for host', () => {
    const { rerender } = render(<FinalView room={finished} isHost={false} onPlayAgain={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'משחק חוזר' })).toBeNull()
    const onPlayAgain = vi.fn()
    rerender(<FinalView room={finished} isHost={true} onPlayAgain={onPlayAgain} />)
    screen.getByRole('button', { name: 'משחק חוזר' }).click()
    expect(onPlayAgain).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/playerColors.test.ts src/ui/gameScreens.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/ui/playerColors.ts`:

```ts
import type { Room } from '../types'

const PALETTE = ['#4e9df3', '#f3a04e', '#e26bd2', '#8ee34e', '#f3e14e', '#7a6bf0', '#4ee3c8', '#f06b6b']

export function playerColor(uid: string, room: Room): string {
  const ordered = Object.entries(room.players)
    .sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || ua.localeCompare(ub))
    .map(([u]) => u)
  return PALETTE[Math.max(0, ordered.indexOf(uid)) % PALETTE.length]
}
```

`src/ui/RoundView.tsx`:

```tsx
import { useState } from 'react'
import type * as L from 'leaflet'
import MapView, { type Pin } from './MapView'
import { currentRound, currentRoundIndex, deadlineOf } from '../game/derive'
import { localityById } from '../game/localities'
import type { Guess, Room } from '../types'

interface RoundViewProps {
  room: Room
  nowMs: number
  myUid: string
  myGuess: Guess | null
  onConfirm: (p: { lat: number; lng: number }) => void
  onMapReady?: (map: L.Map) => void
}

export default function RoundView({ room, nowMs, myUid, myGuess, onConfirm, onMapReady }: RoundViewProps) {
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null)
  const round = currentRound(room)!
  const index = currentRoundIndex(room)
  const target = localityById(round.localityId)
  const secondsLeft = Math.max(0, Math.ceil((deadlineOf(round, room.config) - nowMs) / 1000))
  const fraction = secondsLeft / room.config.seconds
  const locked = myGuess != null

  const pins: Pin[] = []
  const shown = locked ? myGuess : pick
  if (shown) pins.push({ lat: shown.lat, lng: shown.lng, label: 'ההימור שלי', color: '#4e9df3', kind: 'guess' })

  return (
    <div className="screen">
      <div className="hud">
        <span className="muted">
          סבב {index + 1} / {room.config.rounds}
        </span>
        <h2 className="locality-name">{target.name}</h2>
        <span>{secondsLeft}</span>
      </div>
      <div className={`timebar${fraction < 0.25 ? ' low' : ''}`}>
        <div style={{ width: `${fraction * 100}%` }} />
      </div>
      <MapView pins={pins} onPick={locked ? undefined : setPick} onMapReady={onMapReady} />
      {locked ? (
        <p className="card">ההימור נקלט! ממתינים לשאר…</p>
      ) : (
        <button disabled={!pick} onClick={() => pick && onConfirm(pick)}>
          אישור
        </button>
      )}
    </div>
  )
}
```

`src/ui/RevealView.tsx`:

```tsx
import MapView, { type Pin } from './MapView'
import { REVEAL_MS, currentRound, currentRoundIndex, scoresFor } from '../game/derive'
import { localityById } from '../game/localities'
import { haversineKm, pointsFor } from '../game/score'
import { playerColor } from './playerColors'
import type { Room } from '../types'

interface RevealViewProps {
  room: Room
  nowMs: number
  myUid: string
}

export default function RevealView({ room, nowMs, myUid }: RevealViewProps) {
  const round = currentRound(room)!
  const index = currentRoundIndex(room)
  const target = localityById(round.localityId)
  const totals = scoresFor(room)
  const nextIn = Math.max(0, Math.ceil((round.revealAt! + REVEAL_MS - nowMs) / 1000))
  const isLast = index + 1 >= room.config.rounds

  const rows = Object.entries(room.players)
    .map(([uid, p]) => {
      const guess = room.guesses?.[index]?.[uid] ?? null
      const distanceKm = guess ? haversineKm(guess, target) : null
      return {
        uid,
        name: p.name,
        guess,
        distanceKm,
        points: distanceKm == null ? 0 : pointsFor(distanceKm),
        total: totals[uid]?.total ?? 0,
      }
    })
    .sort((a, b) => b.points - a.points)

  const pins: Pin[] = [
    { lat: target.lat, lng: target.lng, label: target.name, color: '#2eb886', kind: 'answer' },
    ...rows
      .filter((r) => r.guess)
      .map((r) => ({
        lat: r.guess!.lat,
        lng: r.guess!.lng,
        label: r.name,
        color: playerColor(r.uid, room),
        kind: 'guess' as const,
      })),
  ]

  return (
    <div className="screen">
      <div className="hud">
        <h2 className="locality-name">{target.name}</h2>
        <span className="muted">{isLast ? `סיום בעוד ${nextIn}` : `הסבב הבא בעוד ${nextIn}`}</span>
      </div>
      <MapView pins={pins} />
      <table className="scores">
        <thead>
          <tr>
            <th>שחקן</th>
            <th>מרחק</th>
            <th>נקודות</th>
            <th>סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid} style={r.uid === myUid ? { fontWeight: 700 } : undefined}>
              <td>{r.name}</td>
              <td>{r.distanceKm == null ? '—' : `${r.distanceKm.toFixed(1)} ק״מ`}</td>
              <td>{r.points}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`src/ui/FinalView.tsx`:

```tsx
import { scoresFor } from '../game/derive'
import type { Room } from '../types'

interface FinalViewProps {
  room: Room
  isHost: boolean
  onPlayAgain: () => void
}

export default function FinalView({ room, isHost, onPlayAgain }: FinalViewProps) {
  const totals = scoresFor(room)
  const ranked = Object.entries(room.players)
    .map(([uid, p]) => ({ uid, name: p.name, total: totals[uid]?.total ?? 0 }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="screen">
      <h1>מלך הארץ: {ranked[0]?.name} 👑</h1>
      <div className="podium">
        {ranked.slice(0, 3).map((r, i) => (
          <div className="slot" key={r.uid} style={{ paddingBottom: 12 + (3 - i) * 14 }}>
            <div>{['🥇', '🥈', '🥉'][i]}</div>
            <b>{r.name}</b>
            <div className="muted">{r.total}</div>
          </div>
        ))}
      </div>
      <table className="scores">
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.uid}>
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isHost && <button onClick={onPlayAgain}>משחק חוזר</button>}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui && git commit -m "feat: round, reveal, and final screens"
```

---

### Task 12: App wiring — routing, auth, room subscription, host engine

**Files:**
- Create: `src/App.test.tsx`
- Modify: `src/App.tsx` (replace the Task 1 placeholder entirely)

**Interfaces:**
- Consumes: everything — `isConfigured`, `ensureSignedIn`, `db` (Task 7); `createRoomClient` (Task 8); `watchServerOffset`, `serverNow` (Task 8); `codeFromHash` (Task 5); derivations (Task 6); all screens (Tasks 10–11).
- Produces: the complete `App` component. Responsibilities: hash routing (`#ABCD`), anonymous sign-in, subscribing to the room, a 250 ms clock tick, the **host engine** (only the current host runs `hostAction` and writes transitions), and **host migration** (if the stored host goes offline, the eligible player claims host).

- [ ] **Step 1: Write the failing tests**

`src/App.test.tsx` — mock the Firebase-touching modules; drive `App` by invoking the captured `watchRoom` callback:

```tsx
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { Room } from './types'
import raw from './data/localities.json'
import type { Locality } from './game/localities'

const LOC = (raw as Locality[])[0]

let roomCb: ((room: Room | null) => void) | null = null
const mockClient = {
  createRoom: vi.fn(async () => 'ABCD'),
  joinRoom: vi.fn(async () => {}),
  watchRoom: vi.fn((_code: string, cb: (room: Room | null) => void) => {
    roomCb = cb
    return () => {}
  }),
  setupPresence: vi.fn(),
  startGame: vi.fn(async () => {}),
  submitGuess: vi.fn(async () => {}),
  closeRound: vi.fn(async () => {}),
  startNextRound: vi.fn(async () => {}),
  finishGame: vi.fn(async () => {}),
  playAgain: vi.fn(async () => {}),
  claimHost: vi.fn(async () => {}),
  cleanupStaleRooms: vi.fn(async () => {}),
}

vi.mock('./firebase', () => ({
  db: {},
  isConfigured: () => true,
  ensureSignedIn: async () => 'me',
}))
vi.mock('./net/roomClient', () => ({ createRoomClient: () => mockClient }))
vi.mock('./net/serverTime', () => ({
  watchServerOffset: () => () => {},
  serverNow: () => Date.now(),
}))

import App from './App'

function baseRoom(over: Partial<Room> = {}): Room {
  return {
    createdAt: 1,
    hostUid: 'me',
    state: 'lobby',
    config: { rounds: 2, seconds: 20, difficulty: 'easy' },
    players: {
      me: { name: 'אני', joinedAt: 1, online: true },
      p2: { name: 'חבר', joinedAt: 2, online: true },
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  roomCb = null
  window.location.hash = ''
})

describe('App', () => {
  test('no hash → landing in create mode', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'צור חדר' })).toBeInTheDocument()
  })

  test('hash + not a member yet → landing in join mode', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom({ players: { p2: { name: 'חבר', joinedAt: 2, online: true } } })))
    expect(await screen.findByRole('button', { name: 'הצטרפות' })).toBeInTheDocument()
  })

  test('member in lobby room → lobby screen', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom()))
    expect(await screen.findByText('חדר המתנה')).toBeInTheDocument()
    expect(mockClient.setupPresence).toHaveBeenCalledWith('ABCD')
  })

  test('playing room → round screen; finished → final screen', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        baseRoom({
          state: 'playing',
          rounds: [{ localityId: LOC.id, startedAt: Date.now() }],
        }),
      ),
    )
    expect(await screen.findByText(LOC.name)).toBeInTheDocument()
    act(() => roomCb!(baseRoom({ state: 'finished' })))
    expect(await screen.findByText(/מלך הארץ:/)).toBeInTheDocument()
  })

  test('host engine closes an expired round', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        baseRoom({
          state: 'playing',
          rounds: [{ localityId: LOC.id, startedAt: Date.now() - 60_000 }],
        }),
      ),
    )
    await vi.waitFor(() => expect(mockClient.closeRound).toHaveBeenCalledWith('ABCD', 0))
  })

  test('host migration: stored host offline → eligible player claims', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        baseRoom({
          hostUid: 'p2',
          players: {
            me: { name: 'אני', joinedAt: 1, online: true },
            p2: { name: 'חבר', joinedAt: 2, online: false },
          },
        }),
      ),
    )
    await vi.waitFor(() => expect(mockClient.claimHost).toHaveBeenCalledWith('ABCD'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx` — Expected: FAIL (placeholder App).

- [ ] **Step 3: Implement**

`src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { db, ensureSignedIn, isConfigured } from './firebase'
import { createRoomClient, type RoomClient } from './net/roomClient'
import { serverNow, watchServerOffset } from './net/serverTime'
import { codeFromHash } from './game/roomCodes'
import { currentRoundIndex, eligibleHost, hostAction, phaseOf } from './game/derive'
import type { Room, RoomConfig } from './types'
import Landing from './ui/Landing'
import Lobby from './ui/Lobby'
import RoundView from './ui/RoundView'
import RevealView from './ui/RevealView'
import FinalView from './ui/FinalView'

export default function App() {
  const [uid, setUid] = useState<string | null>(null)
  const [client, setClient] = useState<RoomClient | null>(null)
  const [code, setCode] = useState<string | null>(codeFromHash(window.location.hash))
  const [room, setRoom] = useState<Room | null>(null)
  const [now, setNow] = useState(() => serverNow())
  const busyRef = useRef(false) // one host action in flight at a time

  useEffect(() => {
    if (!isConfigured()) return
    let cancelled = false
    const stopOffset = watchServerOffset(db)
    ensureSignedIn().then((u) => {
      if (cancelled) return
      setUid(u)
      setClient(createRoomClient(db, u))
    })
    const onHash = () => setCode(codeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    const tick = setInterval(() => setNow(serverNow()), 250)
    return () => {
      cancelled = true
      stopOffset()
      window.removeEventListener('hashchange', onHash)
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    if (!client || !code) {
      setRoom(null)
      return
    }
    return client.watchRoom(code, setRoom)
  }, [client, code])

  const joined = !!(uid && room?.players?.[uid])

  useEffect(() => {
    if (client && code && joined) client.setupPresence(code)
  }, [client, code, joined])

  // Host engine + host migration — driven by the clock tick.
  useEffect(() => {
    if (!client || !code || !room || !uid || !joined || busyRef.current) return
    const run = async (job: Promise<void>) => {
      busyRef.current = true
      try {
        await job
      } finally {
        busyRef.current = false
      }
    }
    const storedHost = room.players[room.hostUid]
    if ((!storedHost || !storedHost.online) && eligibleHost(room.players) === uid) {
      void run(client.claimHost(code))
      return
    }
    if (room.hostUid !== uid) return
    const action = hostAction(room, now)
    if (action.type === 'close') void run(client.closeRound(code, currentRoundIndex(room)))
    else if (action.type === 'next') void run(client.startNextRound(code, room))
    else if (action.type === 'finish') void run(client.finishGame(code))
  }, [client, code, room, uid, joined, now])

  if (!isConfigured()) {
    return (
      <div className="screen">
        <h1>מלך הארץ אונליין</h1>
        <p className="card">
          Firebase עדיין לא הוגדר. יש להדביק את הגדרות הפרויקט ב־<code>src/firebase-config.ts</code>{' '}
          (ראו README).
        </p>
      </div>
    )
  }
  if (!uid || !client) return <div className="screen">מתחברים…</div>

  const createAndEnter = async (name: string, config: RoomConfig) => {
    void client.cleanupStaleRooms()
    const newCode = await client.createRoom(config, name)
    window.location.hash = `#${newCode}`
  }

  if (!code) return <Landing joinCode={null} onCreate={createAndEnter} onJoin={() => {}} />
  if (room === null || !joined) {
    return (
      <Landing
        joinCode={code}
        onCreate={createAndEnter}
        onJoin={(name) =>
          client.joinRoom(code, name).catch(() => {
            window.location.hash = ''
          })
        }
      />
    )
  }

  const phase = phaseOf(room)
  const shareUrl = `${window.location.origin}${window.location.pathname}#${code}`
  const isHost = room.hostUid === uid

  if (phase === 'lobby')
    return (
      <Lobby room={room} shareUrl={shareUrl} isHost={isHost} onStart={() => client.startGame(code, room)} />
    )
  if (phase === 'guessing') {
    const i = currentRoundIndex(room)
    return (
      <RoundView
        room={room}
        nowMs={now}
        myUid={uid}
        myGuess={room.guesses?.[i]?.[uid] ?? null}
        onConfirm={(p) => client.submitGuess(code, i, p)}
      />
    )
  }
  if (phase === 'reveal') return <RevealView room={room} nowMs={now} myUid={uid} />
  return <FinalView room={room} isHost={isHost} onPlayAgain={() => client.playAgain(code)} />
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx` — Expected: PASS.
Run: `npm test && npm run build` — Expected: everything PASS, no type errors.

- [ ] **Step 5: Manual smoke against the emulator (browser preview)**

Run the dev server with `VITE_USE_EMULATOR=1` plus the emulator (`PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:start --only database,auth --project demo-eretz` in the background), open two browser tabs, create a room in one and join from the other, and play one round end to end. Verify: pins drop, reveal shows distances, auto-advance works, closing the host tab migrates hostship (⚪ next to old host, game continues).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx && git commit -m "feat: app wiring — routing, host engine, host migration"
```

---

### Task 13: Playwright smoke test — two players, one real round

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: the full app + emulator lane. No new production code.

- [ ] **Step 1: Install Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write config**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5199/eretz-game/' },
  webServer: {
    command: 'VITE_USE_EMULATOR=1 npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/eretz-game/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
```

Add script (emulator wraps Playwright, which wraps vite):

```json
"test:e2e": "PATH=\"/opt/homebrew/opt/openjdk/bin:$PATH\" firebase emulators:exec --only database,auth --project demo-eretz 'playwright test'"
```

- [ ] **Step 3: Write the smoke test**

`e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('two players play a round end to end', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const guestCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  // Host creates a fast room
  await host.goto('/')
  await host.getByLabel('כינוי').fill('מארח')
  await host.getByLabel('סבבים').fill('3')
  await host.getByLabel('שניות לסבב').fill('15')
  await host.getByRole('button', { name: 'צור חדר' }).click()
  await expect(host.getByText('חדר המתנה')).toBeVisible()
  const url = host.url()
  expect(url).toMatch(/#[A-Z]{4}$/)

  // Guest joins via the invite URL
  await guest.goto(url)
  await guest.getByLabel('כינוי').fill('אורחת')
  await guest.getByRole('button', { name: 'הצטרפות' }).click()
  await expect(guest.getByText('חדר המתנה')).toBeVisible()
  await expect(host.getByText('אורחת')).toBeVisible()

  // Host starts; both see a round
  await host.getByRole('button', { name: 'התחל משחק' }).click()
  await expect(host.getByText(/סבב 1 \/ 3/)).toBeVisible()
  await expect(guest.getByText(/סבב 1 \/ 3/)).toBeVisible()

  // Both click the middle of the map and confirm
  for (const page of [host, guest]) {
    await page.locator('.map').click({ position: { x: 200, y: 200 } })
    await page.getByRole('button', { name: 'אישור' }).click()
    await expect(page.getByText(/ההימור נקלט/)).toBeVisible()
  }

  // All guessed → reveal appears with a scores table on both screens
  await expect(host.locator('table.scores')).toBeVisible({ timeout: 15_000 })
  await expect(guest.locator('table.scores')).toBeVisible({ timeout: 15_000 })
  await expect(host.getByRole('cell', { name: 'מארח' })).toBeVisible()
  await expect(host.getByText(/ק״מ/).first()).toBeVisible()
})
```

- [ ] **Step 4: Run it**

Run: `npm run test:e2e` — Expected: PASS. Any click on the map registers a pick (there is no in-bounds validation), so if this flakes, the cause is timing (waits/timeouts), not the click position — fix the test's waits, not app code.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: playwright smoke — two players play a round against the emulator"
```

---

### Task 14: Deployment — GitHub Actions, Pages, README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: the whole repo. Produces the live site.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write README.md**

Contents (write it out in full, in this structure):

1. **What this is** — one paragraph, in Hebrew + English line.
2. **One-time Firebase setup** (the only manual steps, ~5 minutes):
   - Create a project at console.firebase.google.com (free Spark plan, disable Analytics).
   - Build → Authentication → Sign-in method → enable **Anonymous**.
   - Build → Realtime Database → Create database (choose Belgium/europe-west1) → start in locked mode.
   - Realtime Database → Rules tab → paste the contents of `database.rules.json` → Publish.
   - Project settings → General → Your apps → Web app (</>) → copy the config object into `src/firebase-config.ts`.
3. **One-time GitHub setup**:
   - Create a GitHub repo named `eretz-game` (the name must match `base` in `vite.config.ts`; if you pick another name, change `base` too), push `main`.
   - Repo → Settings → Pages → Source: **GitHub Actions**.
   - Push to `main` → the site appears at `https://<user>.github.io/eretz-game/`.
4. **Local development** — `npm run dev` (needs real Firebase config), or fully offline: `npm run emu` + `VITE_USE_EMULATOR=1 npm run dev`. Add this convenience script to package.json: `"emu": "PATH=\"/opt/homebrew/opt/openjdk/bin:$PATH\" firebase emulators:start --only database,auth --project demo-eretz"`.
5. **Tests** — `npm test` (unit), `npm run test:emu` (rules + client vs emulator, needs Java: `brew install openjdk`), `npm run test:e2e` (Playwright smoke).
6. **Refreshing locality data** — `npm run build:data` (hits data.gov.il; commit the regenerated `src/data/localities.json`).
7. **Known trade-off** — no server: a dev-tools-savvy player can peek at the round's answer; fine for friends.

- [ ] **Step 3: Verify the full local pipeline one last time**

Run: `npm test && npm run test:emu && npm run test:e2e && npm run build`
Expected: all PASS. Report the actual output; do not claim success without it.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: GitHub Pages deploy workflow and setup README"
```

- [ ] **Step 5: Hand back to the user**

The site cannot go live without the user's two manual steps (Firebase project + GitHub repo/Pages). Present README's setup checklist and offer to walk through it together — creating accounts and pasting credentials are theirs to do.

---

## Final self-review checklist (run after Task 14)

- Every spec requirement maps to a task: static hosting (1, 14), localities+tiers (2, 4), map style (9), flow (10–12), scoring (3), timer fairness (8: serverTime), host migration (6, 12), reconnect (state all in RTDB), mid-game join (12: join mode always available; scores derive to 0 for missed rounds), stale-room cleanup (7, 8, 12), rules tests (7), emulator state-machine tests (8), Playwright smoke (13), Hebrew RTL (1, 10–11).
- `npm test`, `npm run test:emu`, `npm run test:e2e`, `npm run build` all green.
- No TODO/TBD anywhere in the repo.
