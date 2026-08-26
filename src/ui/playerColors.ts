import type { Room } from '../types'

/* Industry is a mono palette, so player colors are steps of the steel ramp
   plus two neutrals rather than a rainbow. Names are labelled on the map
   next to each marker, so hue only has to separate, not identify. */
const PALETTE = [
  '#1d2d3d', // accent-900
  '#5980a6', // accent
  '#94bce3', // accent-400
  '#416180', // accent-700
  '#b7b7ba', // neutral-400
  '#7e9cb8', // accent-2-500
  '#2c455d', // accent-800
  '#5d5d60', // neutral-700
]

export function playerColor(uid: string, room: Room): string {
  const ordered = Object.entries(room.players)
    .sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || ua.localeCompare(ub))
    .map(([u]) => u)
  return PALETTE[Math.max(0, ordered.indexOf(uid)) % PALETTE.length]
}
