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
  countdown?: number | null // Add countdown to GameState
}

type CardValue = number | string;
const FIBONACCI_CARDS: CardValue[] = [0, 1, 2, 3, 5, 8, 13, 21, '?', '☕']

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
  // Removed unused countdown state variable as we use gameState.countdown

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
      const newSocket = io('/', {
        path: '/api/socket.io',
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
          if (player) {
            if (player.card !== null && player.card !== true) {
              console.log('Updating selected card from server:', player.card)
              setSelectedCard(player.card)
            } else if (player.card === null) {
              console.log('Resetting selected card to null')
              setSelectedCard(null)
            }
            // Keep the current selection if player.card === true (card is selected but hidden)
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
      
      // Update local state immediately
      setSelectedCard(card)
      
      // Send to server
      socket.emit('select-card', { card })
      
      console.log('Selected card:', card)
    },
    [socket]
  )

  // Handle revealing cards with countdown
  const handleRevealCards = useCallback(() => {
    if (!socket) return
    
    // Emit start-countdown event to server
    // This will trigger the countdown for all players
    socket.emit('start-countdown')
    
    // Note: The actual reveal will happen when the server sends back
    // a game-updated event with revealed=true after the countdown
  }, [socket])

  // Handle starting a new round
  const handleNewRound = useCallback(() => {
    if (!socket) return
    socket.emit('new-round')
  }, [socket])

  // Copy game link to clipboard
  const copyGameLink = () => {
    const link = `${window.location.origin}/invite/${gameId}`
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
            <h1 className="text-xl font-bold">Planning Poker: {gameId}</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-md border border-blue-400 bg-transparent px-3 py-1 text-sm text-blue-400 hover:bg-blue-400 hover:text-white"
            >
              New Game
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
        {/* Central Game Area - Centered both vertically and horizontally */}
        <div className="relative mx-auto flex h-[calc(100vh-200px)] items-center justify-center">
          {/* Table - Rectangular with rounded corners like in screenshot */}
          <div className="relative h-64 w-[300px] rounded-lg border-2 border-gray-700 bg-gray-800 sm:h-[180px]">
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
              ) : gameState.countdown ? (
                <div className="text-4xl font-bold text-blue-400 animate-pulse">
                  {gameState.countdown}
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
          
          {/* Players positioned very close around the rectangular table like in screenshot */}
          {players.map((player, index) => {
            // Position players based on number of players
            let left = 50;
            let top = 50;
            
            // For 1-2 players, position them above and below
            if (players.length <= 2) {
              if (index === 0) top = 25; // First player on top, closer to table
              if (index === 1) top = 75; // Second player on bottom, closer to table
            }
            // For 3-4 players, position them in a cross pattern
            else if (players.length <= 4) {
              if (index === 0) { left = 50; top = 25; } // Top, closer to table
              if (index === 1) { left = 75; top = 50; } // Right, closer to table
              if (index === 2) { left = 50; top = 75; } // Bottom, closer to table
              if (index === 3) { left = 25; top = 50; } // Left, closer to table
            }
            // For more players, position them around the table
            else {
              const angle = (index * (360 / players.length)) * (Math.PI / 180);
              const radius = 40; // Further reduced radius to bring players very close to the table
              
              left = 50 + radius * Math.cos(angle - Math.PI/2) / 2; // % of container, starting from top (- Math.PI/2)
              top = 50 + radius * Math.sin(angle - Math.PI/2) / 2; // % of container
            }
            
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
                      // Always show blue styling for selected cards
                      'border-blue-500 bg-blue-500 text-white'
                    }`}
                  >
                    {gameState.revealed && player.card !== null && player.card !== true ? (
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
          
          {/* Results display moved to overlay */}
        </div>

        {/* Results Overlay - Only shown when cards are revealed */}
        {gameState.revealed && gameState.average !== null && (
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-gray-800 p-6 shadow-lg">
            <div className="flex items-center justify-center">
              <div className="mr-4 text-4xl font-bold text-blue-400">{gameState.average}</div>
              <div className="text-xl text-gray-300">Average estimate</div>
            </div>
          </div>
        )}
        
        {/* Card Selection - Fixed at bottom of screen */}
        <div className={`fixed bottom-0 left-0 right-0 p-3 ${gameState.revealed && gameState.average !== null ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
          <div className="mx-auto max-w-4xl">
            {/* Card selection text */}
            <div className="mb-2 text-center">
              <p className="text-blue-400 font-medium">Choose your card 👇</p>
            </div>
            
            {/* Cards - Centered grid */}
            <div className="flex justify-center">
              <div className="grid grid-cols-10 gap-2" style={{ maxWidth: "800px" }}>
              {FIBONACCI_CARDS.map((card) => {
                // Convert both to strings for comparison to handle both number and string cards
                const isSelected = String(selectedCard) === String(card);
                
                return (
                  <button
                    key={card}
                    onClick={() => handleCardSelect(card)}
                    className={`flex h-28 w-[50px] min-w-[50px] items-center justify-center rounded-md border-2 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-blue-500 bg-gray-900 text-gray-300 hover:bg-gray-800'
                    }`}
                    disabled={gameState.revealed}
                  >
                    <span className="text-xl font-bold">{card}</span>
                  </button>
                );
              })}
              </div>
            </div>
            
            {/* No actions needed here since we have the button in the center of the table */}
          </div>
        </div>
      </main>
    </div>
  )
}

export default GameRoom