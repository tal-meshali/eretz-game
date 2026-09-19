import type { Room } from '../types'
import { DIFFICULTY_LABELS } from '../game/localities'
import Marks from './Marks'

interface LobbyProps {
  room: Room
  shareUrl: string
  isHost: boolean
  onStart: () => void
}

/** A host alone in a room can start: waiting on a second person is friction,
 *  and a one-player game scores and reveals exactly like any other. */
const MIN_PLAYERS = 1

export default function Lobby({ room, shareUrl, isHost, onStart }: LobbyProps) {
  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`בואו לשחק מלך הארץ! ${shareUrl}`)}`
  const code = shareUrl.split('#')[1] ?? ''

  return (
    <div className="screen">
      <div className="pad" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="kicker">חדר המתנה</div>
        {code && <div className="code">{code}</div>}
        <div className="small muted" style={{ marginTop: 8 }}>
          {room.config.rounds} סבבים · {room.config.seconds} שניות · רמה:{' '}
          {DIFFICULTY_LABELS[room.config.difficulty]}
        </div>
        <div className="row" style={{ marginTop: 'var(--space-6)' }}>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(shareUrl)}>
            העתק קישור
          </button>
          <a className="btn" href={whatsapp} target="_blank" rel="noreferrer">
            וואטסאפ
          </a>
        </div>
      </div>

      <div className="pad" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="kicker">שחקנים</div>
          <span className="num small">{players.length}</span>
        </div>
        <hr className="rule" style={{ marginTop: 8 }} />
        <ul className="roster">
          {players.map(([uid, p], i) => (
            <li key={uid}>
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <span className={`dot${p.online ? ' on' : ''}`} />
              <span className="name">{p.name}</span>
              {uid === room.hostUid && <span className="badge">מנחה</span>}
              {!p.online && <span className="trail small muted">מתחבר…</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="pad spacer" style={{ paddingBottom: 'var(--space-6)' }}>
        {isHost ? (
          <button
            className="btn btn-primary btn-block bp on-accent"
            disabled={players.length < MIN_PLAYERS}
            onClick={onStart}
          >
            {players.length >= MIN_PLAYERS && <Marks />}
            התחל משחק
          </button>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            ממתינים למנחה שיתחיל…
          </p>
        )}
      </div>
    </div>
  )
}
