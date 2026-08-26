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
