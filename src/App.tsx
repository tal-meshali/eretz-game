import { useEffect, useMemo, useRef, useState } from 'react'
import { completeRedirectSignIn, db, isConfigured, signInWithGoogle, watchUser, type SignedInUser } from './firebase'
import { createRoomClient, type RoomClient } from './net/roomClient'
import { createLocalRoomClient } from './net/localRoomClient'
import { serverNow, watchServerOffset } from './net/serverTime'
import { codeFromHash } from './game/roomCodes'
import { currentRoundIndex, eligibleHost, hostAction, phaseOf } from './game/derive'
import type { Room, RoomConfig } from './types'
import Landing from './ui/Landing'
import Lobby from './ui/Lobby'
import RoundView from './ui/RoundView'
import RevealView from './ui/RevealView'
import FinalView from './ui/FinalView'

// A room doc can transiently exist with only a `players` subtree (join/delete race,
// or presence resurrection) — treat that as no room rather than crashing downstream.
function isValidRoom(room: Room | null): room is Room {
  return !!room && !!room.config && !!room.state
}

const SOLO_UID = 'solo'
const SOLO_NAME = 'שחקן מקומי'

export default function App() {
  const [user, setUser] = useState<SignedInUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [client, setClient] = useState<RoomClient | null>(null)
  const [code, setCode] = useState<string | null>(codeFromHash(window.location.hash))
  const [room, setRoom] = useState<Room | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [now, setNow] = useState(() => serverNow())
  const busyRef = useRef(false) // one host action in flight at a time
  const [solo, setSolo] = useState(false)
  const [soloCode, setSoloCode] = useState<string | null>(null)
  const localClient = useMemo(() => (solo ? createLocalRoomClient(SOLO_UID) : null), [solo])

  // The Firebase uid, which is what the RTDB client is keyed on — null in solo
  // mode, so that effect never runs.
  const fbUid = user?.uid ?? null

  /* One shape for "who is playing and through which client", so the two modes
     are symmetric rather than one being a set of ternaries bolted onto the
     other. Everything below reads from here. */
  const session =
    solo && localClient
      ? { uid: SOLO_UID, displayName: SOLO_NAME, client: localClient }
      : user && client
        ? { uid: user.uid, displayName: user.displayName, client }
        : null
  const activeCode = solo ? soloCode : code

  useEffect(() => {
    if (!isConfigured()) return
    const stopOffset = watchServerOffset(db)
    const stopAuth = watchUser((u) => {
      setUser(u)
      setAuthReady(true)
    })
    completeRedirectSignIn().catch(() => setSignInError('ההתחברות נכשלה — נסו שוב'))
    const onHash = () => setCode(codeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    const tick = setInterval(() => setNow(serverNow()), 250)
    return () => {
      stopOffset()
      stopAuth()
      window.removeEventListener('hashchange', onHash)
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    if (!fbUid) {
      setClient(null)
      return
    }
    const c = createRoomClient(db, fbUid)
    setClient(c)
    void c.cleanupStaleRooms()
  }, [fbUid])

  useEffect(() => {
    setJoinError(null)
    const active = session?.client
    if (!active || !activeCode) {
      setRoom(null)
      return
    }
    return active.watchRoom(activeCode, setRoom)
  }, [session?.client, activeCode])

  const validRoom = isValidRoom(room) ? room : null
  const joined = !!(session && validRoom?.players?.[session.uid])

  useEffect(() => {
    const active = session?.client
    if (active && activeCode && joined) {
      active.setupPresence(activeCode)
      return () => active.teardownPresence()
    }
  }, [session?.client, activeCode, joined])

  // Host engine + host migration — driven by the clock tick.
  useEffect(() => {
    const active = session?.client
    if (!active || !activeCode || !validRoom || !session || !joined || busyRef.current) return
    const run = async (job: Promise<void>) => {
      busyRef.current = true
      try {
        await job
      } finally {
        busyRef.current = false
      }
    }
    const storedHost = validRoom.players[validRoom.hostUid]
    if ((!storedHost || !storedHost.online) && eligibleHost(validRoom.players) === session.uid) {
      void run(active.claimHost(activeCode))
      return
    }
    if (validRoom.hostUid !== session.uid) return
    const action = hostAction(validRoom, now)
    if (action.type === 'close') void run(active.closeRound(activeCode, currentRoundIndex(validRoom)))
    else if (action.type === 'next') void run(active.startNextRound(activeCode, validRoom))
    else if (action.type === 'finish') void run(active.finishGame(activeCode))
  }, [session, activeCode, validRoom, joined, now])

  if (!isConfigured()) {
    return (
      <div className="screen">
        <h1>מלך הארץ אונליין</h1>
        <p className="card">
          Firebase עדיין לא הוגדר. יש להדביק את הגדרות הפרויקט ב־<code>src/firebase-config.ts</code>{' '}
          (ראו README).
        </p>
      </div>
    )
  }
  if (!solo) {
    if (!authReady) return <div className="screen">מתחברים…</div>
    if (!user)
      return (
        <div className="screen">
          <div className="pad stack" style={{ paddingTop: 'var(--space-6)', flex: 1 }}>
            <div>
              <div className="kicker">מדד קרבה · משחק רשת</div>
              <h1 className="wordmark">מלך הארץ</h1>
            </div>
            <p className="muted">כדי לשחק צריך להתחבר עם חשבון Google</p>
            <div className="spacer" style={{ paddingBottom: 'var(--space-6)' }}>
              {signInError && (
                <p className="small" role="alert" style={{ color: '#a33', marginBottom: 'var(--space-3)' }}>
                  {signInError}
                </p>
              )}
              <button
                className="btn btn-primary btn-block bp on-accent"
                onClick={() => {
                  setSignInError(null)
                  signInWithGoogle().catch((e: unknown) => {
                    // closing the popup isn't an error worth shouting about
                    if ((e as { code?: string }).code === 'auth/popup-closed-by-user') return
                    setSignInError('ההתחברות נכשלה — נסו שוב')
                  })
                }}
              >
                התחברות עם Google
              </button>
              {import.meta.env.DEV && (
                <button
                  className="btn btn-block"
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={() => setSolo(true)}
                >
                  משחק מקומי
                </button>
              )}
            </div>
          </div>
        </div>
      )
  }
  if (!session) return <div className="screen">מתחברים…</div>

  const createAndEnter = async (name: string, config: RoomConfig) => {
    if (solo) {
      // No hash: `codeFromHash` would reject a made-up code, and a real one in
      // the URL would survive a reload that solo state does not.
      setSoloCode(await session.client.createRoom(config, name))
      return
    }
    void session.client.cleanupStaleRooms()
    const newCode = await session.client.createRoom(config, name)
    window.location.hash = `#${newCode}`
  }

  const defaultName = session.displayName ?? ''
  if (!activeCode)
    return (
      <Landing joinCode={null} defaultName={defaultName} onCreate={createAndEnter} onJoin={() => {}} />
    )
  if (validRoom === null || !joined) {
    // A failed join stays here with the code intact: silently bouncing the
    // player to the create page reads as a broken link, and most failures
    // are transient (cold connection, auth still propagating).
    return (
      <Landing
        joinCode={activeCode}
        defaultName={defaultName}
        joinError={joinError}
        onCreate={createAndEnter}
        onJoin={(name) => {
          setJoinError(null)
          session.client.joinRoom(activeCode, name).catch((e: unknown) => {
            setJoinError(
              e instanceof Error && e.message === 'room-not-found'
                ? 'החדר לא נמצא — ייתכן שהקוד שגוי או שהמשחק כבר הסתיים'
                : 'ההצטרפות נכשלה — בדקו את החיבור ונסו שוב',
            )
          })
        }}
        onCancelJoin={() => {
          window.location.hash = ''
        }}
      />
    )
  }

  const phase = phaseOf(validRoom)
  const shareUrl = `${window.location.origin}${window.location.pathname}#${activeCode}`
  const isHost = validRoom.hostUid === session.uid

  if (phase === 'lobby')
    return (
      <Lobby
        room={validRoom}
        shareUrl={shareUrl}
        isHost={isHost}
        minPlayers={solo ? 1 : 2}
        onStart={() => session.client.startGame(activeCode, validRoom)}
      />
    )
  if (phase === 'guessing') {
    const i = currentRoundIndex(validRoom)
    return (
      <RoundView
        room={validRoom}
        nowMs={now}
        myUid={session.uid}
        myGuess={validRoom.guesses?.[i]?.[session.uid] ?? null}
        onConfirm={(p) => session.client.submitGuess(activeCode, i, p)}
      />
    )
  }
  if (phase === 'reveal') return <RevealView room={validRoom} nowMs={now} myUid={session.uid} />
  return (
    <FinalView room={validRoom} isHost={isHost} onPlayAgain={() => session.client.playAgain(activeCode)} />
  )
}
