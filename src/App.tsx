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

export default function App() {
  const [uid, setUid] = useState<string | null>(null)
  const [client, setClient] = useState<RoomClient | null>(null)
  const [code, setCode] = useState<string | null>(codeFromHash(window.location.hash))
  const [room, setRoom] = useState<Room | null>(null)
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
    if (!client || !code) {
      setRoom(null)
      return
    }
    return client.watchRoom(code, setRoom)
  }, [client, code])

  const joined = !!(uid && room?.players?.[uid])

  useEffect(() => {
    if (client && code && joined) client.setupPresence(code)
  }, [client, code, joined])

  // Host engine + host migration — driven by the clock tick.
  useEffect(() => {
    if (!client || !code || !room || !uid || !joined || busyRef.current) return
    const run = async (job: Promise<void>) => {
      busyRef.current = true
      try {
        await job
      } finally {
        busyRef.current = false
      }
    }
    const storedHost = room.players[room.hostUid]
    if ((!storedHost || !storedHost.online) && eligibleHost(room.players) === uid) {
      void run(client.claimHost(code))
      return
    }
    if (room.hostUid !== uid) return
    const action = hostAction(room, now)
    if (action.type === 'close') void run(client.closeRound(code, currentRoundIndex(room)))
    else if (action.type === 'next') void run(client.startNextRound(code, room))
    else if (action.type === 'finish') void run(client.finishGame(code))
  }, [client, code, room, uid, joined, now])

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
  if (room === null || !joined) {
    return (
      <Landing
        joinCode={code}
        onCreate={createAndEnter}
        onJoin={(name) =>
          client.joinRoom(code, name).catch(() => {
            window.location.hash = ''
          })
        }
      />
    )
  }

  const phase = phaseOf(room)
  const shareUrl = `${window.location.origin}${window.location.pathname}#${code}`
  const isHost = room.hostUid === uid

  if (phase === 'lobby')
    return (
      <Lobby room={room} shareUrl={shareUrl} isHost={isHost} onStart={() => client.startGame(code, room)} />
    )
  if (phase === 'guessing') {
    const i = currentRoundIndex(room)
    return (
      <RoundView
        room={room}
        nowMs={now}
        myUid={uid}
        myGuess={room.guesses?.[i]?.[uid] ?? null}
        onConfirm={(p) => client.submitGuess(code, i, p)}
      />
    )
  }
  if (phase === 'reveal') return <RevealView room={room} nowMs={now} myUid={uid} />
  return <FinalView room={room} isHost={isHost} onPlayAgain={() => client.playAgain(code)} />
}
