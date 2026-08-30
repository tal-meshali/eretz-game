import { useState } from 'react'
import { DIFFICULTY_LABELS, type Difficulty } from '../game/localities'
import type { RoomConfig } from '../types'
import HeroMap from './HeroMap'
import Marks from './Marks'

interface LandingProps {
  joinCode: string | null
  /** Prefills the nickname field (the signed-in Google display name). */
  defaultName?: string
  /** Shown under the join button; a failed join keeps the code and lets the
   *  player retry instead of silently landing on the create page. */
  joinError?: string | null
  onCreate: (name: string, config: RoomConfig) => void
  onJoin: (name: string) => void
  /** Leave the join flow deliberately (back to creating a room). */
  onCancelJoin?: () => void
}

const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  easy: 'ערים מעל 20,000 תושבים',
  medium: 'יישובים מעל 5,000 תושבים',
  hard: 'כל היישובים בארץ',
}

const DIFFICULTIES = Object.keys(DIFFICULTY_LABELS) as Difficulty[]

export default function Landing({
  joinCode, defaultName = '', joinError = null, onCreate, onJoin, onCancelJoin,
}: LandingProps) {
  const [name, setName] = useState(() => defaultName.trim().slice(0, 20))
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [rounds, setRounds] = useState(10)
  const [seconds, setSeconds] = useState(20)
  const trimmed = name.trim()
  const isValidConfig = rounds >= 3 && rounds <= 20 && seconds >= 10 && seconds <= 60
  const minutes = Math.max(1, Math.round((rounds * (seconds + 8)) / 60))

  return (
    <div className="screen">
      <div className="hero">
        <HeroMap className="hero-map" />
        <div className="hero-veil" />
        <div className="hero-copy">
          <div className="kicker">מדד קרבה · {rounds} סבבים</div>
          <h1 className="wordmark">מלך הארץ</h1>
        </div>
      </div>

      <div className="pad stack" style={{ paddingTop: 'var(--space-6)', flex: 1 }}>
        <div className="field">
          <label className="field-label" htmlFor="nick">
            כינוי
          </label>
          <input
            id="nick"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            placeholder="השם שיראו האחרים"
          />
        </div>

        {joinCode ? (
          <>
            <div>
              <div className="kicker">הוזמנת לחדר</div>
              <div className="code">{joinCode}</div>
            </div>
            <div className="spacer" style={{ paddingBottom: 'var(--space-6)' }}>
              {joinError && (
                <p className="small" role="alert" style={{ color: '#a33', marginBottom: 'var(--space-3)' }}>
                  {joinError}
                </p>
              )}
              <button
                className="btn btn-primary btn-block bp on-accent"
                disabled={!trimmed}
                onClick={() => onJoin(trimmed)}
              >
                {trimmed && <Marks />}
                הצטרפות
              </button>
              {joinError && onCancelJoin && (
                <button
                  className="btn btn-block"
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={onCancelJoin}
                >
                  ליצירת חדר חדש
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="kicker">הגדרות מנחה</div>
              <hr className="rule" style={{ margin: '9px 0 14px' }} />
              <div className="seg" role="group" aria-label="רמת קושי">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={difficulty === d}
                    onClick={() => setDifficulty(d)}
                  >
                    {DIFFICULTY_LABELS[d]}
                  </button>
                ))}
              </div>
              <div className="small muted" style={{ marginTop: 7 }}>
                {DIFFICULTY_NOTE[difficulty]}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <Stepper
                label="סבבים"
                value={rounds}
                onChange={setRounds}
                min={3}
                max={20}
                step={1}
              />
              <Stepper
                label="שניות לסבב"
                value={seconds}
                onChange={setSeconds}
                min={10}
                max={60}
                step={5}
              />
            </div>

            <div className="spacer" style={{ paddingBottom: 'var(--space-6)' }}>
              <div
                className="row small muted"
                style={{ justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}
              >
                <span>משך משוער</span>
                <span className="num">{minutes} דק׳</span>
              </div>
              <button
                className="btn btn-primary btn-block bp on-accent"
                disabled={!trimmed || !isValidConfig}
                onClick={() => onCreate(trimmed, { rounds, seconds, difficulty })}
              >
                {trimmed && isValidConfig && <Marks />}
                צור חדר
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface StepperProps {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  step: number
}

function Stepper({ label, value, onChange, min, max, step }: StepperProps) {
  // A label may not wrap buttons, so the association is explicit here.
  const id = `step-${label}`
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper">
        <button
          type="button"
          aria-label={`הפחת ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          aria-label={`הוסף ${label}`}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
      </div>
    </div>
  )
}
