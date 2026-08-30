import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const { authState, signInMock } = vi.hoisted(() => ({
  authState: {
    user: { uid: 'me', displayName: null } as { uid: string; displayName: string | null } | null,
  },
  signInMock: vi.fn(async () => {}),
}))

vi.mock('./firebase', () => ({
  db: {},
  isConfigured: () => true,
  watchUser: (cb: (u: typeof authState.user) => void) => {
    cb(authState.user)
    return () => {}
  },
  signInWithGoogle: signInMock,
  completeRedirectSignIn: async () => {},
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
  authState.user = { uid: 'me', displayName: null }
  window.location.hash = ''
})

describe('App', () => {
  test('no hash → landing in create mode', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'צור חדר' })).toBeInTheDocument()
  })

  test('signed out → Google sign-in screen, button triggers sign-in', async () => {
    authState.user = null
    render(<App />)
    const button = await screen.findByRole('button', { name: 'התחברות עם Google' })
    expect(screen.queryByLabelText('כינוי')).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(signInMock).toHaveBeenCalledTimes(1)
  })

  test('Google display name prefills the nickname field', async () => {
    authState.user = { uid: 'me', displayName: 'טל כהן' }
    render(<App />)
    expect(await screen.findByLabelText('כינוי')).toHaveValue('טל כהן')
  })

  test('hash + not a member yet → landing in join mode', async () => {
    window.location.hash = '#ABCD'
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom({ players: { p2: { name: 'חבר', joinedAt: 2, online: true } } })))
    expect(await screen.findByRole('button', { name: 'הצטרפות' })).toBeInTheDocument()
  })

  test('transient join failure keeps the join screen with an error — no bounce to create', async () => {
    window.location.hash = '#ABCD'
    mockClient.joinRoom.mockRejectedValueOnce(new Error('join-failed'))
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(baseRoom({ players: { p2: { name: 'חבר', joinedAt: 2, online: true } } })))
    await userEvent.type(screen.getByLabelText('כינוי'), 'דנה')
    await userEvent.click(screen.getByRole('button', { name: 'הצטרפות' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ההצטרפות נכשלה')
    expect(window.location.hash).toBe('#ABCD')
    expect(screen.getByRole('button', { name: 'הצטרפות' })).toBeInTheDocument()
  })

  test('room-not-found join shows the error and only a deliberate click leads to create', async () => {
    window.location.hash = '#ABCD'
    mockClient.joinRoom.mockRejectedValueOnce(new Error('room-not-found'))
    render(<App />)
    await screen.findByLabelText('כינוי')
    act(() => roomCb!(null))
    await userEvent.type(screen.getByLabelText('כינוי'), 'דנה')
    await userEvent.click(screen.getByRole('button', { name: 'הצטרפות' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('החדר לא נמצא')
    await userEvent.click(screen.getByRole('button', { name: 'ליצירת חדר חדש' }))
    act(() => window.dispatchEvent(new Event('hashchange')))
    expect(await screen.findByRole('button', { name: 'צור חדר' })).toBeInTheDocument()
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
