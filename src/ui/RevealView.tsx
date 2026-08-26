import MapView, { type Pin } from './MapView'
import { REVEAL_MS, currentRound, currentRoundIndex, scoresFor } from '../game/derive'
import { localityById } from '../game/localities'
import { haversineKm, pointsFor } from '../game/score'
import { playerColor } from './playerColors'
import Marks from './Marks'
import type { Room } from '../types'

interface RevealViewProps {
  room: Room
  nowMs: number
  myUid: string
}

const RINGS = [25, 50, 100]

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
    { lat: target.lat, lng: target.lng, label: target.name, kind: 'answer' },
    ...rows
      .filter((r) => r.guess)
      .map((r) => ({
        lat: r.guess!.lat,
        lng: r.guess!.lng,
        // My own guess goes unlabelled — the dimension line names it, and two
        // labels this close to the answer would collide.
        label: r.uid === myUid ? '' : r.name,
        color: playerColor(r.uid, room),
        kind: 'guess' as const,
      })),
  ]

  const mine = rows.find((r) => r.uid === myUid)?.guess ?? null

  return (
    <div className="screen">
      <div className="pad" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-3)' }}>
        <div className="kicker">
          סבב {index + 1} · תוצאה
        </div>
        <div className="hud" style={{ marginTop: 4 }}>
          <h2 className="locality-name">{target.name}</h2>
          <div style={{ textAlign: 'end' }}>
            <div className="num ltr" style={{ fontSize: 14, color: 'var(--color-accent)' }}>
              {target.lat.toFixed(3)}°N {target.lng.toFixed(3)}°E
            </div>
            <div className="small muted">{target.pop.toLocaleString('he-IL')} תושבים</div>
          </div>
        </div>
      </div>

      <div className="plate bp" style={{ margin: '0 var(--space-6)' }}>
        <Marks />
        <MapView
          pins={pins}
          rings={RINGS}
          ringsAt={{ lat: target.lat, lng: target.lng }}
          link={mine ? { from: mine, to: { lat: target.lat, lng: target.lng } } : null}
          fitTo={pins.map((p) => ({ lat: p.lat, lng: p.lng }))}
        />
      </div>

      <div className="pad" style={{ paddingTop: 'var(--space-6)' }}>
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
              <tr key={r.uid} className={r.uid === myUid ? 'me' : undefined}>
                <td>{r.name}</td>
                <td className="num muted">
                  {r.distanceKm == null ? '—' : `${r.distanceKm.toFixed(1)} ק״מ`}
                </td>
                <td className="num pts">{r.points}</td>
                <td className="num">{r.total.toLocaleString('he-IL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="pad spacer row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingBlock: 'var(--space-4) var(--space-6)',
        }}
      >
        <span className="small muted">{isLast ? 'סיום בעוד' : 'הסבב הבא בעוד'}</span>
        <span className="num" style={{ fontSize: 26, fontWeight: 600 }}>
          {nextIn}
        </span>
      </div>
    </div>
  )
}
