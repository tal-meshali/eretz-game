import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Lobby from './Lobby'
import type { Room } from '../types'

const room: Room = {
  createdAt: 1,
  hostUid: 'h',
  state: 'lobby',
  config: { rounds: 10, seconds: 20, difficulty: 'easy' },
  players: {
    h: { name: 'מארח', joinedAt: 1, online: true },
    p: { name: 'שחקן', joinedAt: 2, online: false },
  },
}

describe('Lobby', () => {
  test('lists players', () => {
    render(<Lobby room={room} shareUrl="https://x/#ABCD" isHost={false} onStart={vi.fn()} />)
    expect(screen.getByText('מארח')).toBeTruthy()
    expect(screen.getByText('שחקן')).toBeTruthy()
  })
  test('start button only for host, and a lone host can start', () => {
    const { rerender } = render(
      <Lobby room={room} shareUrl="u" isHost={false} onStart={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'התחל משחק' })).toBeNull()
    rerender(<Lobby room={room} shareUrl="u" isHost={true} onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'התחל משחק' })).toBeEnabled()
    const solo: Room = { ...room, players: { h: room.players.h } }
    rerender(<Lobby room={solo} shareUrl="u" isHost={true} onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'התחל משחק' })).toBeEnabled()
  })
  test('the lone host\'s start button actually fires onStart', () => {
    const onStart = vi.fn()
    const solo: Room = { ...room, players: { h: room.players.h } }
    render(
      <Lobby room={solo} shareUrl="u" isHost={true} onStart={onStart} />,
    )
    const start = screen.getByRole('button', { name: 'התחל משחק' })
    expect(start).toBeEnabled()
    start.click()
    expect(onStart).toHaveBeenCalled()
  })
})
