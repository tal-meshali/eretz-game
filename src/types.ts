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
  finishedAt?: number
  config: RoomConfig
  players: Record<string, Player>
  rounds?: (RoundData | null)[] // RTDB returns numeric-keyed objects as arrays
  guesses?: Record<number, Record<string, Guess>>
}
