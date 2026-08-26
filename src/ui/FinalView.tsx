import { scoresFor } from '../game/derive'
import Marks from './Marks'
import type { Room } from '../types'

interface FinalViewProps {
  room: Room
  isHost: boolean
  onPlayAgain: () => void
}

const HEIGHTS = [176, 132, 106]
const ORDER = [1, 0, 2] // silver, gold, bronze — the podium reads from the middle

export default function FinalView({ room, isHost, onPlayAgain }: FinalViewProps) {
  const totals = scoresFor(room)
  const ranked = Object.entries(room.players)
    .map(([uid, p]) => ({ uid, name: p.name, total: totals[uid]?.total ?? 0 }))
    .sort((a, b) => b.total - a.total)

  const top = ORDER.filter((i) => ranked[i]).map((i) => ({ place: i + 1, ...ranked[i] }))
  const rest = ranked.slice(3)

  return (
    <div className="screen">
      <div className="pad" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="kicker">סיום · {room.config.rounds} סבבים</div>
        <h1 className="crown" style={{ marginTop: 6 }}>
          מלך הארץ:<span className="crown-name">{ranked[0]?.name}</span>
        </h1>
        <div className="num muted" style={{ fontSize: 17, marginTop: 2 }}>
          {(ranked[0]?.total ?? 0).toLocaleString('he-IL')} נקודות
        </div>
      </div>

      {top.length > 0 && (
        <div className="podium pad" style={{ paddingTop: 'var(--space-8)' }}>
          {top.map((r) => (
            <div
              key={r.uid}
              className={`slot bp${r.place === 1 ? ' first on-accent' : ''}`}
              style={{ height: HEIGHTS[r.place - 1] }}
            >
              <Marks />
              <div className="place">{r.place}</div>
              <div>
                <div className="who">{r.name}</div>
                <div className="num muted">{r.total.toLocaleString('he-IL')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="pad" style={{ paddingTop: 'var(--space-8)' }}>
          <hr className="rule" />
          <ul className="roster">
            {rest.map((r, i) => (
              <li key={r.uid}>
                <span className="idx">{i + 4}</span>
                <span className="name">{r.name}</span>
                <span className="num trail">{r.total.toLocaleString('he-IL')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="spacer" />
      {isHost && (
        <div className="pad" style={{ paddingBottom: 'var(--space-6)' }}>
          <button className="btn btn-primary btn-block bp on-accent" onClick={onPlayAgain}>
            <Marks />
            משחק חוזר
          </button>
        </div>
      )}
    </div>
  )
}
