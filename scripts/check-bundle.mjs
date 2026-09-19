// Fails the build if dev-only code reached the production bundle.
//
// `createLocalRoomClient` is behind `import.meta.env.DEV`, which Vite
// substitutes with `false` so the branch and its import are dead code. That is
// Rolldown's behaviour, not a guarantee in the code, and the day it changes
// nothing else would notice — so it is asserted here rather than assumed.
//
// This does NOT grep the minified JS for the identifier: every local binding
// gets mangled to a single letter, so the real export name never appears as
// literal text in the bundle even when the module genuinely ships. Instead it
// reads the sourcemaps (vite.config.ts sets `build.sourcemap: 'hidden'`,
// which emits .map files without linking them from the JS), whose `sources`
// list the contributing files by path — immune to minification because that
// list exists to point back at the pre-minified source. The .map files are
// deleted afterwards so nothing extra ships to GitHub Pages.

import { readdir, readFile, rm } from 'node:fs/promises'

const ASSETS = new URL('../dist/assets/', import.meta.url)
const FORBIDDEN = ['localRoomClient']

async function listMapFiles() {
  let entries
  try {
    entries = await readdir(ASSETS)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  return entries.filter((f) => f.endsWith('.js.map'))
}

const mapFiles = await listMapFiles()
if (mapFiles === null) {
  console.error('no dist/assets directory — did vite build run?')
  process.exit(1)
}
if (mapFiles.length === 0) {
  console.error('no .js.map files in dist/assets — is build.sourcemap set to "hidden" in vite.config.ts?')
  process.exit(1)
}

const found = []
for (const file of mapFiles) {
  const raw = await readFile(new URL(file, ASSETS), 'utf8')
  const map = JSON.parse(raw)
  for (const source of map.sources ?? []) {
    for (const needle of FORBIDDEN) if (source.includes(needle)) found.push(`${file}: ${source}`)
  }
}

// Read before delete: the maps must not reach GitHub Pages, pass or fail.
await Promise.all(mapFiles.map((file) => rm(new URL(file, ASSETS))))

if (found.length) {
  console.error(`dev-only code in the production bundle:\n  ${found.join('\n  ')}`)
  process.exit(1)
}
console.log(`bundle check — ${mapFiles.length} map(s), no dev-only code`)
