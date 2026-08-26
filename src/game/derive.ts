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
