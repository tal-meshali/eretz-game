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
