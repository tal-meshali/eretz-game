import type { Room } from '../types'

const PALETTE = ['#4e9df3', '#f3a04e', '#e26bd2', '#8ee34e', '#f3e14e', '#7a6bf0', '#4ee3c8', '#f06b6b']

export function playerColor(uid: string, room: Room): string {
  const ordered = Object.entries(room.players)
    .sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || ua.localeCompare(ub))
    .map(([u]) => u)
  return PALETTE[Math.max(0, ordered.indexOf(uid)) % PALETTE.length]
}
