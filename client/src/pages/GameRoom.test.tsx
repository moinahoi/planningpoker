import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import GameRoom from './GameRoom'

// Fake socket.io client: records emits, lets tests push server events.
const fake = vi.hoisted(() => {
  type Handler = (payload?: unknown) => void
  const handlers: Record<string, Handler> = {}
  const socket = {
    id: 'me',
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: (event: string, handler: Handler) => {
      handlers[event] = handler
    },
  }
  return { socket, handlers, io: vi.fn(() => socket) }
})
vi.mock('socket.io-client', () => ({ io: fake.io }))
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const server = (event: string, payload?: unknown) =>
  act(() => fake.handlers[event](payload))

type Card = number | string | null | true
function state(cards: Record<string, Card>, extra: object = {}) {
  const names: Record<string, string> = { me: 'Alice', bob: 'Bob' }
  return {
    id: 'g1',
    revealed: false,
    average: null,
    countdown: null,
    players: Object.fromEntries(
      Object.entries(cards).map(([id, card]) => [id, { id, name: names[id], card }]),
    ),
    ...extra,
  }
}

const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={['/game/g1']}>
      <Routes>
        <Route path="/" element={<p>home page</p>} />
        <Route path="/game/:gameId" element={<GameRoom />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function enterRoom(initial = state({ me: null, bob: null })) {
  renderRoom()
  await screen.findByText('Connecting to game...')
  await vi.waitFor(() => expect(fake.handlers.connect).toBeDefined())
  await server('connect')
  await server('game-updated', initial)
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('playerName', 'Alice')
  for (const key of Object.keys(fake.handlers)) delete fake.handlers[key]
  fake.socket.emit.mockClear()
  fetchMock.mockReset().mockResolvedValue({ ok: true })
  fake.socket.disconnect.mockClear()
  play.mockReset().mockResolvedValue(undefined)
  pause.mockReset().mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('GameRoom: entering', () => {
  test('redirects home without a stored name', async () => {
    localStorage.clear()
    renderRoom()
    expect(await screen.findByText('home page')).toBeTruthy()
    expect(fake.io).not.toHaveBeenCalledWith('/', expect.anything())
  })

  test('shows an error for an unknown game', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    renderRoom()
    expect(await screen.findByText('Game not found')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(await screen.findByText('home page')).toBeTruthy()
  })

  test('checks the game, connects and joins with the stored name', async () => {
    await enterRoom()
    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1')
    expect(fake.io).toHaveBeenCalledWith('/', { path: '/api/socket.io', query: { gameId: 'g1' } })
    expect(fake.socket.emit).toHaveBeenCalledWith('join-game', { gameId: 'g1', playerName: 'Alice' })
    expect(screen.getByText('Planning Poker: g1')).toBeTruthy()
    expect(screen.getByText('(You)')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Pick your cards!')).toBeTruthy()
  })

  test('shows server errors and disconnects', async () => {
    await enterRoom()
    await server('error', { message: 'Invalid card value' })
    expect(screen.getByText('Invalid card value')).toBeTruthy()
  })

  test('shows a message when the connection drops', async () => {
    await enterRoom()
    await server('disconnect')
    expect(screen.getByText('Disconnected from server. Please refresh the page.')).toBeTruthy()
  })
})

describe('GameRoom: voting round', () => {
  test('selecting a card sends it to the server', async () => {
    await enterRoom()
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(fake.socket.emit).toHaveBeenCalledWith('select-card', { card: 5 })
    fireEvent.click(screen.getByRole('button', { name: '☕' }))
    expect(fake.socket.emit).toHaveBeenCalledWith('select-card', { card: '☕' })
  })

  test('offers all ten cards', async () => {
    await enterRoom()
    for (const card of ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕']) {
      expect(screen.getByRole('button', { name: card })).toBeTruthy()
    }
  })

  test('another player\'s card stays hidden and enables Reveal', async () => {
    await enterRoom()
    await server('game-updated', state({ me: null, bob: true }))
    expect(screen.queryByText('Pick your cards!')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Cards' }))
    expect(fake.socket.emit).toHaveBeenCalledWith('start-countdown')
  })

  test('shows the countdown', async () => {
    await enterRoom()
    await server('game-updated', state({ me: 5, bob: true }, { countdown: 2 }))
    expect(screen.getByText('2', { selector: 'div' })).toBeTruthy() // the card "2" is a span
    expect(screen.queryByRole('button', { name: 'Reveal Cards' })).toBeNull()
  })

  test('reveal shows all cards and the average, locks the cards', async () => {
    await enterRoom()
    await server('game-updated', state({ me: 5, bob: 8 }, { revealed: true, average: '6.5' }))
    expect(screen.getByText('6.5')).toBeTruthy()
    expect(screen.getByText('Average estimate')).toBeTruthy()
    expect((screen.getByRole('button', { name: '13' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('Start New Round asks the server to reset', async () => {
    await enterRoom()
    await server('game-updated', state({ me: 5, bob: 8 }, { revealed: true, average: '6.5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start New Round' }))
    expect(fake.socket.emit).toHaveBeenCalledWith('new-round')

    await server('game-updated', state({ me: null, bob: null }))
    expect(screen.getByText('Pick your cards!')).toBeTruthy()
    expect(screen.queryByText('Average estimate')).toBeNull()
  })

  test('no average overlay when only ? and coffee were played', async () => {
    await enterRoom()
    await server('game-updated', state({ me: '?', bob: '☕' }, { revealed: true, average: null }))
    expect(screen.queryByText('Average estimate')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start New Round' })).toBeTruthy()
  })
})

describe('GameRoom: header actions', () => {
  test('Invite players copies the invite link', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await enterRoom()
    fireEvent.click(screen.getByRole('button', { name: 'Invite players' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/g1`)
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy()
  })

  test('New Game goes back home and leaves the game', async () => {
    await enterRoom()
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }))
    expect(await screen.findByText('home page')).toBeTruthy()
    expect(fake.socket.disconnect).toHaveBeenCalled()
  })

  test('sound toggle is remembered', async () => {
    await enterRoom()
    fireEvent.click(screen.getByTitle('Mute sound'))
    expect(localStorage.getItem('soundEnabled')).toBe('false')
    expect(screen.getByTitle('Enable sound')).toBeTruthy()
  })
})

describe('GameRoom: theme music', () => {
  test('plays once someone picks, stops when everyone has picked', async () => {
    await enterRoom()
    await server('game-updated', state({ me: null, bob: true }))
    expect(play).toHaveBeenCalled()
    pause.mockClear()
    await server('game-updated', state({ me: 5, bob: true }))
    expect(pause).toHaveBeenCalled()
  })

  test('stays silent when muted', async () => {
    localStorage.setItem('soundEnabled', 'false')
    await enterRoom()
    await server('game-updated', state({ me: null, bob: true }))
    expect(play).not.toHaveBeenCalled()
  })
})
