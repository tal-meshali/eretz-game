import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { Room } from './types'
import raw from './data/localities.json'
import type { Locality } from './game/localities'

const LOC = (raw as Locality[])[0]

let roomCb: ((room: Room | null) => void) | null = null
const mockClient = {
  createRoom: vi.fn(async () => 'ABCD'),
  joinRoom: vi.fn(async () => {}),
  watchRoom: vi.fn((_code: string, cb: (room: Room | null) => void) => {
    roomCb = cb
    return () => {}
  }),
  setupPresence: vi.fn(),
  teardownPresence: vi.fn(),
  startGame: vi.fn(async () => {}),
  submitGuess: vi.fn(async () => {}),
  closeRound: vi.fn(async () => {}),
  startNextRound: vi.fn(async () => {}),
  finishGame: vi.fn(async () => {}),
  playAgain: vi.fn(async () => {}),
  claimHost: vi.fn(async () => {}),
  cleanupStaleRooms: vi.fn(async () => {}),
}

vi.mock('./firebase', () => ({
  db: {},
  isConfigured: () => true,
  ensureSignedIn: async () => 'me',
}))
vi.mock('./net/roomClient', () => ({ createRoomClient: () => mockClient }))
vi.mock('./net/serverTime', () => ({
  watchServerOffset: () => () => {},
  serverNow: () => Date.now(),
}))

import App from './App'

function baseRoom(over: Partial<Room> = {}): Room {
  return {
    createdAt: 1,
    hostUid: 'me',
    state: 'lobby',
    config: { rounds: 2, seconds: 20, difficulty: 'easy' },
    players: {
      me: { name: 'אני', joinedAt: 1, online: true },
      p2: { name: 'חבר', joinedAt: 2, online: true },
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  roomCb = null
  window.location.hash = ''
})

describe('App', () => {
  test('no hash → landing in create mode', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'צור חדר' })).toBeInTheDocument()
  })

  test('hash + not a member yet → landing in join mode', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom({ players: { p2: { name: 'חבר', joinedAt: 2, online: true } } })))
    expect(await screen.findByRole('button', { name: 'הצטרפות' })).toBeInTheDocument()
  })

  test('member in lobby room → lobby screen', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom()))
    expect(await screen.findByText('חדר המתנה')).toBeInTheDocument()
    expect(mockClient.setupPresence).toHaveBeenCalledWith('ABCD')
  })

  test('leaving the room (unmount) tears down presence', async () => {
    window.location.hash = '#ABCD'
    const { unmount } = render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom()))
    await screen.findByText('חדר המתנה')
    expect(mockClient.setupPresence).toHaveBeenCalledWith('ABCD')
    expect(mockClient.teardownPresence).not.toHaveBeenCalled()
    unmount()
    expect(mockClient.teardownPresence).toHaveBeenCalledTimes(1)
  })

  test('back button (hash cleared) tears down presence', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom()))
    await screen.findByText('חדר המתנה')
    act(() => {
      window.location.hash = ''
      window.dispatchEvent(new Event('hashchange'))
    })
    await vi.waitFor(() => expect(mockClient.teardownPresence).toHaveBeenCalledTimes(1))
  })

  test('malformed room (missing config/state) falls back to join landing instead of crashing', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        { players: { me: { name: 'אני', joinedAt: 1, online: true } } } as unknown as Room,
      ),
    )
    expect(await screen.findByRole('button', { name: 'הצטרפות' })).toBeInTheDocument()
  })

  test('playing room → round screen; finished → final screen', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        baseRoom({
          state: 'playing',
          rounds: [{ localityId: LOC.id, startedAt: Date.now() }],
        }),
      ),
    )
    expect(await screen.findByText(LOC.name)).toBeInTheDocument()
    act(() => roomCb!(baseRoom({ state: 'finished' })))
    expect(await screen.findByText(/מלך הארץ:/)).toBeInTheDocument()
  })

  test('host engine closes an expired round', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        baseRoom({
          state: 'playing',
          rounds: [{ localityId: LOC.id, startedAt: Date.now() - 60_000 }],
        }),
      ),
    )
    await vi.waitFor(() => expect(mockClient.closeRound).toHaveBeenCalledWith('ABCD', 0))
  })

  test('host migration: stored host offline → eligible player claims', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() =>
      roomCb!(
        baseRoom({
          hostUid: 'p2',
          players: {
            me: { name: 'אני', joinedAt: 1, online: true },
            p2: { name: 'חבר', joinedAt: 2, online: false },
          },
        }),
      ),
    )
    await vi.waitFor(() => expect(mockClient.claimHost).toHaveBeenCalledWith('ABCD'))
  })
})
