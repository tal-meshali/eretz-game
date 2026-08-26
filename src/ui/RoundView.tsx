import { useEffect, useState } from 'react'
import type * as L from 'leaflet'
import MapView, { type Pin } from './MapView'
import { currentRound, currentRoundIndex, deadlineOf } from '../game/derive'
import { localityById } from '../game/localities'
import Marks from './Marks'
import type { Guess, Room } from '../types'

interface RoundViewProps {
  room: Room
  nowMs: number
  myUid: string
  myGuess: Guess | null
  onConfirm: (p: { lat: number; lng: number }) => void
  onMapReady?: (map: L.Map) => void
}

export default function RoundView({
  room, nowMs, myUid, myGuess, onConfirm, onMapReady,
}: RoundViewProps) {
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
  const low = fraction < 0.25

  const shown = locked ? myGuess : pick
  const pins: Pin[] = shown
    ? [{ lat: shown.lat, lng: shown.lng, label: 'ההימור שלי', color: '#1d1f20', kind: 'guess' }]
    : []

  return (
    <div className="screen">
      <div className="pad" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-4)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="kicker">
            סבב {index + 1} / {room.config.rounds}
          </div>
        </div>
        <div className="hud" style={{ marginTop: 4 }}>
          <h2 className="locality-name">{target.name}</h2>
          <div className={`clock${low ? ' low' : ''}`}>{secondsLeft}</div>
        </div>
      </div>

      <div className={`timebar${low ? ' low' : ''}`} style={{ marginInline: 'var(--space-6)' }}>
        <div style={{ width: `${fraction * 100}%` }} />
      </div>

      <div className="plate bp" style={{ margin: 'var(--space-6) var(--space-6) 0' }}>
        <Marks />
        <MapView pins={pins} onPick={locked ? undefined : setPick} onMapReady={onMapReady} />
        <div className="readout">
          <span>
            {shown
              ? `${shown.lat.toFixed(4)}°N  ${shown.lng.toFixed(4)}°E`
              : 'AWAITING FIX'}
          </span>
          <span>WGS 84</span>
        </div>
      </div>

      <div className="pad spacer" style={{ paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-6)' }}>
        {locked ? (
          <p className="small muted" style={{ margin: 0 }}>
            ההימור נקלט · ממתינים לשאר…
          </p>
        ) : (
          <>
            <p className="small muted" style={{ minHeight: 18, marginBottom: 'var(--space-3)' }}>
              {pick ? 'נקודה סומנה · ניתן לתקן עד לאישור' : 'סמנו על המפה היכן היישוב'}
            </p>
            <button
              className="btn btn-primary btn-block bp on-accent"
              disabled={!pick}
              onClick={() => pick && onConfirm(pick)}
            >
              {pick && <Marks />}
              אישור
            </button>
          </>
        )}
      </div>
    </div>
  )
}
