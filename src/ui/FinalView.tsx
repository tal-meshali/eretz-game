import { scoresFor } from '../game/derive'
import type { Room } from '../types'

interface FinalViewProps {
  room: Room
  isHost: boolean
  onPlayAgain: () => void
}

export default function FinalView({ room, isHost, onPlayAgain }: FinalViewProps) {
  const totals = scoresFor(room)
  const ranked = Object.entries(room.players)
    .map(([uid, p]) => ({ uid, name: p.name, total: totals[uid]?.total ?? 0 }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="screen">
      <h1>מלך הארץ: {ranked[0]?.name} 👑</h1>
      <div className="podium">
        {ranked.slice(0, 3).map((r, i) => (
          <div className="slot" key={r.uid} style={{ paddingBottom: 12 + (3 - i) * 14 }}>
            <div>{['🥇', '🥈', '🥉'][i]}</div>
            <b>{r.name}</b>
            <div className="muted">{r.total}</div>
          </div>
        ))}
      </div>
      <table className="scores">
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.uid}>
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isHost && <button onClick={onPlayAgain}>משחק חוזר</button>}
    </div>
  )
}
