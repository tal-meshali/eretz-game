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
