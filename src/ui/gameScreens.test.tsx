import { describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as L from 'leaflet'
import RoundView from './RoundView'
import RevealView from './RevealView'
import FinalView from './FinalView'
import type { Room } from '../types'
import raw from '../data/localities.json'
import type { Locality } from '../game/localities'

const LOC = (raw as Locality[])[0]
const T0 = 100_000

function playingRoom(over: Partial<Room> = {}): Room {
  return {
    createdAt: 1,
    hostUid: 'h',
    state: 'playing',
    config: { rounds: 2, seconds: 20, difficulty: 'hard' },
    players: {
      h: { name: 'מארח', joinedAt: 1, online: true },
      p: { name: 'שחקן', joinedAt: 2, online: true },
    },
    rounds: [{ localityId: LOC.id, startedAt: T0 }],
    ...over,
  }
}

describe('RoundView', () => {
  test('shows locality name, round counter, and remaining seconds', () => {
    render(
      <RoundView room={playingRoom()} nowMs={T0 + 5000} myUid="p" myGuess={null} onConfirm={vi.fn()} />,
    )
    expect(screen.getByText(LOC.name)).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  test('confirm flows: disabled → pick on map → confirm calls onConfirm', async () => {
    const onConfirm = vi.fn()
    let map: L.Map | null = null
    render(
      <RoundView
        room={playingRoom()}
        nowMs={T0 + 5000}
        myUid="p"
        myGuess={null}
        onConfirm={onConfirm}
        onMapReady={(m) => (map = m)}
      />,
    )
    const btn = screen.getByRole('button', { name: 'אישור' })
    expect(btn).toBeDisabled()
    act(() => {
      map!.fire('click', { latlng: { lat: 32.1, lng: 34.9 } })
    })
    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    expect(onConfirm).toHaveBeenCalledWith({ lat: 32.1, lng: 34.9 })
  })

  test('after my guess is in, shows waiting state', () => {
    render(
      <RoundView
        room={playingRoom()}
        nowMs={T0 + 5000}
        myUid="p"
        myGuess={{ lat: 32, lng: 34.8, at: T0 + 1 }}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText(/ההימור נקלט/)).toBeInTheDocument()
  })

  test('resets the tentative pick when the round advances', async () => {
    const onConfirm = vi.fn()
    let map: L.Map | null = null
    const { rerender } = render(
      <RoundView
        room={playingRoom()}
        nowMs={T0 + 5000}
        myUid="p"
        myGuess={null}
        onConfirm={onConfirm}
        onMapReady={(m) => (map = m)}
      />,
    )
    act(() => {
      map!.fire('click', { latlng: { lat: 32.1, lng: 34.9 } })
    })
    expect(screen.getByRole('button', { name: 'אישור' })).not.toBeDisabled()

    const T1 = T0 + 30000
    rerender(
      <RoundView
        room={playingRoom({
          rounds: [
            { localityId: LOC.id, startedAt: T0, revealAt: T0 + 20000 },
            { localityId: LOC.id, startedAt: T1 },
          ],
        })}
        nowMs={T1 + 1000}
        myUid="p"
        myGuess={null}
        onConfirm={onConfirm}
        onMapReady={(m) => (map = m)}
      />,
    )
    expect(screen.getByRole('button', { name: 'אישור' })).toBeDisabled()
  })
})

describe('RevealView', () => {
  test('shows the answer and per-player distance and points, best first', () => {
    const room = playingRoom({
      rounds: [{ localityId: LOC.id, startedAt: T0, revealAt: T0 + 20000 }],
      guesses: {
        0: {
          h: { lat: LOC.lat, lng: LOC.lng, at: T0 + 1 }, // bullseye
          p: { lat: LOC.lat + 0.5, lng: LOC.lng, at: T0 + 2 }, // ~55 km off
        },
      },
    })
    render(<RevealView room={room} nowMs={T0 + 21000} myUid="p" />)
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('מארח')
    expect(rows[0]).toHaveTextContent('1000')
    expect(rows[1]).toHaveTextContent('שחקן')
  })
})

describe('FinalView', () => {
  const finished = playingRoom({
    state: 'finished',
    rounds: [{ localityId: LOC.id, startedAt: T0, revealAt: T0 + 20000 }],
    guesses: { 0: { h: { lat: LOC.lat, lng: LOC.lng, at: T0 + 1 } } },
  })
  test('crowns the winner and lists totals', () => {
    render(<FinalView room={finished} isHost={false} onPlayAgain={vi.fn()} />)
    expect(screen.getByText(/מלך הארץ:/)).toHaveTextContent('מארח')
  })
  test('play-again button only for host', () => {
    const { rerender } = render(<FinalView room={finished} isHost={false} onPlayAgain={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'משחק חוזר' })).toBeNull()
    const onPlayAgain = vi.fn()
    rerender(<FinalView room={finished} isHost={true} onPlayAgain={onPlayAgain} />)
    screen.getByRole('button', { name: 'משחק חוזר' }).click()
    expect(onPlayAgain).toHaveBeenCalled()
  })
})
