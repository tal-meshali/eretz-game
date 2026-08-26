import { useEffect, useState } from 'react'
import type * as L from 'leaflet'
import MapView, { type Pin } from './MapView'
import { currentRound, currentRoundIndex, deadlineOf } from '../game/derive'
import { localityById } from '../game/localities'
import type { Guess, Room } from '../types'

interface RoundViewProps {
  room: Room
  nowMs: number
  myUid: string
  myGuess: Guess | null
  onConfirm: (p: { lat: number; lng: number }) => void
  onMapReady?: (map: L.Map) => void
}

export default function RoundView({ room, nowMs, myUid, myGuess, onConfirm, onMapReady }: RoundViewProps) {
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null)
  const round = currentRound(room)!
  const index = currentRoundIndex(room)

  useEffect(() => {
    setPick(null)
  }, [index])

  const target = localityById(round.localityId)
  const secondsLeft = Math.max(0, Math.ceil((deadlineOf(round, room.config) - nowMs) / 1000))
  const fraction = secondsLeft / room.config.seconds
  const locked = myGuess != null

  const pins: Pin[] = []
  const shown = locked ? myGuess : pick
  if (shown) pins.push({ lat: shown.lat, lng: shown.lng, label: 'ההימור שלי', color: '#4e9df3', kind: 'guess' })

  return (
    <div className="screen">
      <div className="hud">
        <span className="muted">
          סבב {index + 1} / {room.config.rounds}
        </span>
        <h2 className="locality-name">{target.name}</h2>
        <span>{secondsLeft}</span>
      </div>
      <div className={`timebar${fraction < 0.25 ? ' low' : ''}`}>
        <div style={{ width: `${fraction * 100}%` }} />
      </div>
      <MapView pins={pins} onPick={locked ? undefined : setPick} onMapReady={onMapReady} />
      {locked ? (
        <p className="card">ההימור נקלט! ממתינים לשאר…</p>
      ) : (
        <button disabled={!pick} onClick={() => pick && onConfirm(pick)}>
          אישור
        </button>
      )}
    </div>
  )
}
