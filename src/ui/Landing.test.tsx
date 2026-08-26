import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Landing from './Landing'

describe('Landing — create mode', () => {
  test('submits name and config with defaults', async () => {
    const onCreate = vi.fn()
    render(<Landing joinCode={null} onCreate={onCreate} onJoin={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('כינוי'), 'טל')
    await userEvent.click(screen.getByRole('button', { name: 'צור חדר' }))
    expect(onCreate).toHaveBeenCalledWith('טל', { rounds: 10, seconds: 20, difficulty: 'easy' })
  })
  test('create button disabled without a name', () => {
    render(<Landing joinCode={null} onCreate={vi.fn()} onJoin={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'צור חדר' })).toBeDisabled()
  })
})

describe('Landing — join mode', () => {
  test('shows the room code and calls onJoin', async () => {
    const onJoin = vi.fn()
    render(<Landing joinCode="ABCD" onCreate={vi.fn()} onJoin={onJoin} />)
    expect(screen.getByText(/ABCD/)).toBeTruthy()
    await userEvent.type(screen.getByLabelText('כינוי'), 'דנה')
    await userEvent.click(screen.getByRole('button', { name: 'הצטרפות' }))
    expect(onJoin).toHaveBeenCalledWith('דנה')
  })
})
