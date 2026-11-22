import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router'
import HomePage from './HomePage'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
const respond = (body: unknown, ok = true) =>
  fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body })

const GameStub = () => <p>game room {useParams().gameId}</p>

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/invite/:gameId" element={<HomePage />} />
        <Route path="/game/:gameId" element={<GameStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

const typeName = (name: string) =>
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: name } })

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
})

describe('HomePage: create game', () => {
  test('shows only name field and create button', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Planning Poker' })).toBeTruthy()
    expect(screen.queryByLabelText('Game ID')).toBeNull()
    expect(screen.getByRole('button', { name: 'Create New Game' })).toBeTruthy()
  })

  test('requires a name', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Create New Game' }))
    expect(screen.getByText('Please enter your name')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('creates a game, stores the name and opens the game room', async () => {
    respond({ gameId: 'abc123' })
    renderAt('/')
    typeName('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Create New Game' }))

    expect(await screen.findByText('game room abc123')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/games', { method: 'POST' })
    expect(localStorage.getItem('playerName')).toBe('Alice')
  })

  test.each([
    ['is unreachable', () => fetchMock.mockRejectedValue(new Error('down'))],
    ['answers with an error', () => respond({}, false)],
  ])('shows an error when the server %s', async (_, setup) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setup()
    renderAt('/')
    typeName('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Create New Game' }))

    expect(await screen.findByText('Failed to create game. Please try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create New Game' })).toBeTruthy()
  })
})

describe('HomePage: invite link', () => {
  test('shows the invite banner with a read-only game id', () => {
    renderAt('/invite/xyz789')
    expect(screen.getByText(/invited to join/)).toBeTruthy()
    const gameId = screen.getByLabelText('Game ID') as HTMLInputElement
    expect(gameId.value).toBe('xyz789')
    expect(gameId.readOnly).toBe(true)
  })

  test('requires a name to join', () => {
    renderAt('/invite/xyz789')
    fireEvent.submit(screen.getByRole('button', { name: 'Join This Game' }))
    expect(screen.getByText('Please enter your name')).toBeTruthy()
  })

  test('joins the game with a name', async () => {
    renderAt('/invite/xyz789')
    typeName('Bob')
    fireEvent.click(screen.getByRole('button', { name: 'Join This Game' }))

    expect(await screen.findByText('game room xyz789')).toBeTruthy()
    expect(localStorage.getItem('playerName')).toBe('Bob')
  })

  test('skips the form when a name is already stored', async () => {
    localStorage.setItem('playerName', 'Bob')
    renderAt('/invite/xyz789')
    expect(await screen.findByText('game room xyz789')).toBeTruthy()
  })

  test('can still create a new game instead', async () => {
    respond({ gameId: 'new111' })
    renderAt('/invite/xyz789')
    typeName('Bob')
    fireEvent.click(screen.getByRole('button', { name: 'Create New Game' }))
    expect(await screen.findByText('game room new111')).toBeTruthy()
  })
})
