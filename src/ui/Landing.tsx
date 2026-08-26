import { useState } from 'react'
import { DIFFICULTY_LABELS, type Difficulty } from '../game/localities'
import type { RoomConfig } from '../types'

interface LandingProps {
  joinCode: string | null
  onCreate: (name: string, config: RoomConfig) => void
  onJoin: (name: string) => void
}

export default function Landing({ joinCode, onCreate, onJoin }: LandingProps) {
  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [rounds, setRounds] = useState(10)
  const [seconds, setSeconds] = useState(20)
  const trimmed = name.trim()
  const isValidConfig = rounds >= 3 && rounds <= 20 && seconds >= 10 && seconds <= 60

  return (
    <div className="screen">
      <h1>מלך הארץ אונליין</h1>
      <div className="card">
        <label className="field">
          כינוי
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </label>
        {joinCode ? (
          <>
            <p>
              הוזמנת לחדר <b>{joinCode}</b>
            </p>
            <button disabled={!trimmed} onClick={() => onJoin(trimmed)}>
              הצטרפות
            </button>
          </>
        ) : (
          <>
            <div className="row">
              <label className="field">
                רמת קושי
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                סבבים
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                />
              </label>
              <label className="field">
                שניות לסבב
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                />
              </label>
            </div>
            <button disabled={!trimmed || !isValidConfig} onClick={() => onCreate(trimmed, { rounds, seconds, difficulty })}>
              צור חדר
            </button>
          </>
        )}
      </div>
    </div>
  )
}
