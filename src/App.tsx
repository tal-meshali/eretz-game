import { useEffect, useRef, useState } from 'react'
import { db, ensureSignedIn, isConfigured } from './firebase'
import { createRoomClient, type RoomClient } from './net/roomClient'
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

export default function App() {
  const [uid, setUid] = useState<string | null>(null)
  const [client, setClient] = useState<RoomClient | null>(null)
  const [code, setCode] = useState<string | null>(codeFromHash(window.location.hash))
  const [room, setRoom] = useState<Room | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [now, setNow] = useState(() => serverNow())
  const busyRef = useRef(false) // one host action in flight at a time

  useEffect(() => {
    if (!isConfigured()) return
    let cancelled = false
    const stopOffset = watchServerOffset(db)
    ensureSignedIn().then((u) => {
      if (cancelled) return
      setUid(u)
      setClient(createRoomClient(db, u))
    })
    const onHash = () => setCode(codeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    const tick = setInterval(() => setNow(serverNow()), 250)
    return () => {
      cancelled = true
      stopOffset()
      window.removeEventListener('hashchange', onHash)
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    setJoinError(null)
    if (!client || !code) {
      setRoom(null)
      return
    }
    return client.watchRoom(code, setRoom)
  }, [client, code])

  const validRoom = isValidRoom(room) ? room : null
  const joined = !!(uid && validRoom?.players?.[uid])

  useEffect(() => {
    if (client && code && joined) {
      client.setupPresence(code)
      return () => client.teardownPresence()
    }
  }, [client, code, joined])

  // Host engine + host migration — driven by the clock tick.
  useEffect(() => {
    if (!client || !code || !validRoom || !uid || !joined || busyRef.current) return
    const run = async (job: Promise<void>) => {
      busyRef.current = true
      try {
        await job
      } finally {
        busyRef.current = false
      }
    }
    const storedHost = validRoom.players[validRoom.hostUid]
    if ((!storedHost || !storedHost.online) && eligibleHost(validRoom.players) === uid) {
      void run(client.claimHost(code))
      return
    }
    if (validRoom.hostUid !== uid) return
    const action = hostAction(validRoom, now)
    if (action.type === 'close') void run(client.closeRound(code, currentRoundIndex(validRoom)))
    else if (action.type === 'next') void run(client.startNextRound(code, validRoom))
    else if (action.type === 'finish') void run(client.finishGame(code))
  }, [client, code, validRoom, uid, joined, now])

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
  if (!uid || !client) return <div className="screen">מתחברים…</div>

  const createAndEnter = async (name: string, config: RoomConfig) => {
    void client.cleanupStaleRooms()
    const newCode = await client.createRoom(config, name)
    window.location.hash = `#${newCode}`
  }

  if (!code) return <Landing joinCode={null} onCreate={createAndEnter} onJoin={() => {}} />
  if (validRoom === null || !joined) {
    // A failed join stays here with the code intact: silently bouncing the
    // player to the create page reads as a broken link, and most failures
    // are transient (cold connection, auth still propagating).
    return (
      <Landing
        joinCode={code}
        joinError={joinError}
        onCreate={createAndEnter}
        onJoin={(name) => {
          setJoinError(null)
          client.joinRoom(code, name).catch((e: unknown) => {
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
  const shareUrl = `${window.location.origin}${window.location.pathname}#${code}`
  const isHost = validRoom.hostUid === uid

  if (phase === 'lobby')
    return (
      <Lobby
        room={validRoom}
        shareUrl={shareUrl}
        isHost={isHost}
        onStart={() => client.startGame(code, validRoom)}
      />
    )
  if (phase === 'guessing') {
    const i = currentRoundIndex(validRoom)
    return (
      <RoundView
        room={validRoom}
        nowMs={now}
        myUid={uid}
        myGuess={validRoom.guesses?.[i]?.[uid] ?? null}
        onConfirm={(p) => client.submitGuess(code, i, p)}
      />
    )
  }
  if (phase === 'reveal') return <RevealView room={validRoom} nowMs={now} myUid={uid} />
  return <FinalView room={validRoom} isHost={isHost} onPlayAgain={() => client.playAgain(code)} />
}
