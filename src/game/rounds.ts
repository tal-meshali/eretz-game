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
