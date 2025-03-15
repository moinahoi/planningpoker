import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import axios from 'axios'

// Define types for our game state
interface Player {
  id: string
  name: string
  card: number | string | null | true // null = not selected, true = selected but hidden
}

interface GameState {
  id: string
  players: Record<string, Player>
  revealed: boolean
  average: string | null
}

type CardValue = number | string;
const FIBONACCI_CARDS: CardValue[] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?', '☕']

const GameRoom = () => {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [selectedCard, setSelectedCard] = useState<CardValue | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)

  // Initialize socket connection and join game
  useEffect(() => {
    if (!gameId) {
      navigate('/')
      return
    }

    // Get player name from localStorage or prompt
    const storedName = localStorage.getItem('playerName')
    if (!storedName) {
      navigate('/')
      return
    }
    setPlayerName(storedName)

    // Check if game exists
    const checkGame = async () => {
      try {
        await axios.get(`/api/games/${gameId}`)
      } catch (err) {
        setError('Game not found')
        setIsConnecting(false)
        return
      }

      // Initialize socket
      const newSocket = io('/api/', {
        query: { gameId },
      })

      newSocket.on('connect', () => {
        console.log('Connected to server')
        setIsConnecting(false)
        
        // Join the game
        newSocket.emit('join-game', { gameId, playerName: storedName })
      })

      newSocket.on('game-updated', (updatedGameState: GameState) => {
        setGameState(updatedGameState)
        
        // Update selected card based on game state
        const playerId = newSocket.id
        if (playerId && updatedGameState.players) {
          const player = updatedGameState.players[playerId]
          if (player && player.card !== null && player.card !== true) {
            setSelectedCard(player.card)
          } else {
            setSelectedCard(null)
          }
        }
      })

      newSocket.on('error', (err: { message: string }) => {
        setError(err.message)
      })

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server')
        setError('Disconnected from server. Please refresh the page.')
      })

      setSocket(newSocket)

      // Cleanup on unmount
      return () => {
        newSocket.disconnect()
      }
    }

    checkGame()
  }, [gameId, navigate])

  // Handle card selection
  const handleCardSelect = useCallback(
    (card: CardValue) => {
      if (!socket) return
      
      setSelectedCard(card)
      socket.emit('select-card', { card })
    },
    [socket]
  )

  // Handle revealing cards
  const handleRevealCards = useCallback(() => {
    if (!socket) return
    socket.emit('reveal-cards')
  }, [socket])

  // Handle starting a new round
  const handleNewRound = useCallback(() => {
    if (!socket) return
    socket.emit('new-round')
  }, [socket])

  // Copy game link to clipboard
  const copyGameLink = () => {
    const link = `${window.location.origin}/game/${gameId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isConnecting) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-blue-400">Connecting to game...</h1>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md rounded-lg bg-gray-800 p-6 text-center shadow-md">
          <h1 className="mb-4 text-2xl font-bold text-red-400">Error</h1>
          <p className="mb-6 text-gray-300">{error}</p>
          <button onClick={() => navigate('/')} className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-blue-400">Loading game...</h1>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
        </div>
      </div>
    )
  }

  const players = Object.values(gameState.players)
  const currentPlayer = socket && socket.id ? gameState.players[socket.id] : null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-800 p-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center">
            <svg className="mr-2 h-6 w-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
              <path d="M12 11l-5-3v6l5 3 5-3v-6l-5 3z" fill="white"></path>
            </svg>
            <h1 className="text-xl font-bold">My Game Name</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-md border border-blue-400 bg-transparent px-3 py-1 text-sm text-blue-400 hover:bg-blue-400 hover:text-white"
            >
              New Game
            </button>
            
            <button className="rounded-full bg-blue-500 p-2 text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            
            <div className="flex items-center">
              <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
                {playerName.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">{playerName}</span>
            </div>
            
            <button
              onClick={copyGameLink}
              className="rounded-md border border-blue-400 bg-transparent px-4 py-1 text-blue-400 hover:bg-blue-400 hover:text-white"
            >
              {copied ? 'Copied!' : 'Invite players'}
            </button>
          </div>
        </div>
      </header>

      {/* Game Area */}
      <main className="mx-auto max-w-6xl p-4">
        {/* Central Game Area */}
        <div className="relative mx-auto mb-8 flex h-[400px] items-center justify-center">
          {/* Table */}
          <div className="relative h-64 w-64 rounded-full border-2 border-gray-700 bg-gray-800 sm:h-80 sm:w-80">
            {/* Table center */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-blue-300">
              {players.length === 0 ? (
                <div>
                  <p className="mb-2">Feeling lonely? 😢</p>
                  <button
                    onClick={copyGameLink}
                    className="rounded-md border border-blue-400 bg-transparent px-4 py-1 text-blue-400 hover:bg-blue-400 hover:text-white"
                  >
                    Invite players
                  </button>
                </div>
              ) : gameState.revealed ? (
                <button
                  onClick={handleNewRound}
                  className="rounded-md bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 transition-all transform hover:scale-105"
                >
                  Start New Round
                </button>
              ) : players.some(player => player.card !== null) ? (
                <button
                  onClick={handleRevealCards}
                  className="rounded-md bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 transition-all transform hover:scale-105"
                >
                  Reveal Cards
                </button>
              ) : (
                <p>Pick your cards!</p>
              )}
            </div>
          </div>
          
          {/* Players around the table */}
          {players.map((player, index) => {
            // Calculate position around the circle
            const angle = (index * (360 / players.length)) * (Math.PI / 180);
            const radius = 100; // pixels from center (reduced from 150)
            const left = 50 + (radius / 320) * 100 * Math.cos(angle); // % of container
            const top = 50 + (radius / 200) * 100 * Math.sin(angle); // % of container
            
            return (
              <div
                key={player.id}
                className="absolute flex flex-col items-center"
                style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
              >
                {/* Card */}
                {player.card === null ? (
                  <div className="mb-2 h-16 w-12 rounded-md border-2 border-dashed border-gray-600 bg-gray-700"></div>
                ) : (
                  <div
                    className={`mb-2 flex h-16 w-12 items-center justify-center rounded-md border-2 ${
                      typeof player.card === 'number' || typeof player.card === 'string'
                        ? 'border-blue-500 bg-blue-900 text-white'
                        : 'border-gray-600 bg-gray-700'
                    }`}
                  >
                    {typeof player.card === 'number' || typeof player.card === 'string' ? (
                      <span className="text-lg font-bold">{player.card}</span>
                    ) : (
                      <span className="text-xs font-medium">?</span>
                    )}
                  </div>
                )}
                
                {/* Player name */}
                <div className="flex items-center justify-center rounded-md bg-gray-800 px-2 py-1">
                  <span className="text-sm font-medium">{player.name}</span>
                  {player.id === currentPlayer?.id && (
                    <span className="ml-1 text-xs text-blue-400">(You)</span>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Results */}
          {gameState.revealed && gameState.average !== null && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-lg bg-gray-800 p-4 shadow-md">
              <div className="flex items-center">
                <div className="mr-4 text-3xl font-bold text-blue-400">{gameState.average}</div>
                <div className="text-gray-300">Average estimate</div>
              </div>
            </div>
          )}
        </div>

        {/* Card Selection - Fixed at bottom of screen */}
        <div className="fixed bottom-0 left-0 right-0 p-3">
          <div className="mx-auto max-w-4xl">
            {/* Card selection text */}
            <div className="mb-2 text-center">
              <p className="text-blue-400 font-medium">Choose your card 👇</p>
            </div>
            
            {/* Cards */}
            <div className="grid grid-cols-12 gap-1">
              {FIBONACCI_CARDS.map((card) => (
                <button
                  key={card}
                  onClick={() => handleCardSelect(card)}
                  className={`flex h-28 items-center justify-center rounded-md border-2 ${
                    selectedCard === card
                      ? 'border-blue-500 bg-blue-900 text-white'
                      : 'border-blue-400 bg-gray-900 text-gray-300 hover:border-blue-300'
                  }`}
                  disabled={gameState.revealed}
                >
                  <span className="text-xl font-bold">{card}</span>
                </button>
              ))}
            </div>
            
            {/* No actions needed here since we have the button in the center of the table */}
          </div>
        </div>
      </main>
    </div>
  )
}

export default GameRoom