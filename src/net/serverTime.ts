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
