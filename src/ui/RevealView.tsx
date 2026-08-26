import MapView, { type Pin } from './MapView'
import { REVEAL_MS, currentRound, currentRoundIndex, scoresFor } from '../game/derive'
import { localityById } from '../game/localities'
import { haversineKm, pointsFor } from '../game/score'
import { playerColor } from './playerColors'
import type { Room } from '../types'

interface RevealViewProps {
  room: Room
  nowMs: number
  myUid: string
}

export default function RevealView({ room, nowMs, myUid }: RevealViewProps) {
  const round = currentRound(room)!
  const index = currentRoundIndex(room)
  const target = localityById(round.localityId)
  const totals = scoresFor(room)
  const nextIn = Math.max(0, Math.ceil((round.revealAt! + REVEAL_MS - nowMs) / 1000))
  const isLast = index + 1 >= room.config.rounds

  const rows = Object.entries(room.players)
    .map(([uid, p]) => {
      const guess = room.guesses?.[index]?.[uid] ?? null
      const distanceKm = guess ? haversineKm(guess, target) : null
      return {
        uid,
        name: p.name,
        guess,
        distanceKm,
        points: distanceKm == null ? 0 : pointsFor(distanceKm),
        total: totals[uid]?.total ?? 0,
      }
    })
    .sort((a, b) => b.points - a.points)

  const pins: Pin[] = [
    { lat: target.lat, lng: target.lng, label: target.name, color: '#2eb886', kind: 'answer' },
    ...rows
      .filter((r) => r.guess)
      .map((r) => ({
        lat: r.guess!.lat,
        lng: r.guess!.lng,
        label: r.name,
        color: playerColor(r.uid, room),
        kind: 'guess' as const,
      })),
  ]

  return (
    <div className="screen">
      <div className="hud">
        <h2 className="locality-name">{target.name}</h2>
        <span className="muted">{isLast ? `סיום בעוד ${nextIn}` : `הסבב הבא בעוד ${nextIn}`}</span>
      </div>
      <MapView pins={pins} />
      <table className="scores">
        <thead>
          <tr>
            <th>שחקן</th>
            <th>מרחק</th>
            <th>נקודות</th>
            <th>סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid} style={r.uid === myUid ? { fontWeight: 700 } : undefined}>
              <td>{r.name}</td>
              <td>{r.distanceKm == null ? '—' : `${r.distanceKm.toFixed(1)} ק״מ`}</td>
              <td>{r.points}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
