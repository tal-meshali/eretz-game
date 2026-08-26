import type { Room } from '../types'
import { DIFFICULTY_LABELS } from '../game/localities'

interface LobbyProps {
  room: Room
  shareUrl: string
  isHost: boolean
  onStart: () => void
}

export default function Lobby({ room, shareUrl, isHost, onStart }: LobbyProps) {
  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`בואו לשחק מלך הארץ! ${shareUrl}`)}`

  return (
    <div className="screen">
      <h1>חדר המתנה</h1>
      <div className="card">
        <p className="muted">
          {room.config.rounds} סבבים · {room.config.seconds} שניות · רמה:{' '}
          {DIFFICULTY_LABELS[room.config.difficulty]}
        </p>
        <div className="row">
          <button onClick={() => navigator.clipboard?.writeText(shareUrl)}>העתק קישור</button>
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <button>שתף בוואטסאפ</button>
          </a>
        </div>
      </div>
      <div className="card">
        <h2>שחקנים ({players.length})</h2>
        <ul>
          {players.map(([uid, p]) => (
            <li key={uid}>
              <span>{p.name}</span> {p.online ? '🟢' : '⚪'} {uid === room.hostUid ? '·מארח' : ''}
            </li>
          ))}
        </ul>
        {isHost && (
          <button disabled={players.length < 2} onClick={onStart}>
            התחל משחק
          </button>
        )}
        {!isHost && <p className="muted">ממתינים למארח שיתחיל…</p>}
      </div>
    </div>
  )
}
