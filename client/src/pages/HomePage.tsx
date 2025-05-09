import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'

const HomePage = () => {
  const navigate = useNavigate()
  const { gameId: paramGameId } = useParams<{ gameId: string }>()
  const [localGameId, setLocalGameId] = useState(paramGameId || '');
  const [isCreating, setIsCreating] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [error, setError] = useState('')

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    try {
      setIsCreating(true)
      const response = await axios.post('/api/games')
      const { gameId } = response.data
      
      // Store player name in localStorage
      localStorage.setItem('playerName', playerName)
      
      // Navigate to the game room
      navigate(`/game/${gameId}`)
    } catch (err) {
      setError('Failed to create game. Please try again.')
      console.error(err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault()
    const gameIdToUse = localGameId || ''
    if (!gameIdToUse.trim()) {
      setError('Please enter a game ID')
      return
    }
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    // Store player name in localStorage
    localStorage.setItem('playerName', playerName)
    
    // Navigate to the game room
    navigate(`/game/${localGameId}`)
  }

  // Auto-join if user has a stored name and gameId is in URL
  useEffect(() => {
    if (paramGameId && localStorage.getItem('playerName')) {
      // User has an existing session and is accessing via invite link
      navigate(`/game/${paramGameId}`)
    }
  }, [paramGameId, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-primary-600">Planning Poker</h1>
          <p className="text-gray-600">Estimate user stories with your team</p>
        </div>

        {paramGameId && (
          <div className="mb-4 rounded-md bg-blue-50 p-4 text-blue-700">
            <p>You've been invited to join a planning poker session!</p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-red-700">
            <p>{error}</p>
          </div>
        )}

        <div className="rounded-lg bg-white p-6 shadow-md">
          {/* If there's a gameId in URL, show the join form, otherwise just show create game */}
          {paramGameId ? (
            <form onSubmit={handleJoinGame}>
              {/* Name Field */}
              <div className="mb-6">
                <label htmlFor="playerName" className="mb-2 block font-medium text-gray-700">
                  Your Name
                </label>
                <input
                  type="text"
                  id="playerName"
                  className="input w-full"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  required
                />
              </div>

              {/* Game ID Field */}
              <div className="mb-6">
                <label htmlFor="gameId" className="mb-2 block font-medium text-gray-700">
                  Game ID
                </label>
                <input
                  type="text"
                  id="gameId"
                  className="input w-full"
                  placeholder="Enter game ID"
                  value={localGameId}
                  onChange={(e) => setLocalGameId(e.target.value)}
                  required
                  readOnly={!!paramGameId}
                />
              </div>

              {/* Join Game Button */}
              <button
                type="submit"
                className="btn btn-primary w-full mb-6"
                disabled={isCreating}
              >
                Join This Game
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">or</span>
                </div>
              </div>

              {/* Create Game Button */}
              <button
                type="button"
                onClick={handleCreateGame}
                className="btn btn-secondary w-full"
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create New Game'}
              </button>
            </form>
          ) : (
            /* When no gameId in URL, only show name field and create game button */
            <form onSubmit={(e) => e.preventDefault()}>
              {/* Name Field */}
              <div className="mb-6">
                <label htmlFor="playerName" className="mb-2 block font-medium text-gray-700">
                  Your Name
                </label>
                <input
                  type="text"
                  id="playerName"
                  className="input w-full"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  required
                />
              </div>

              {/* Create Game Button */}
              <button
                type="button"
                onClick={handleCreateGame}
                className="btn btn-primary w-full"
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create New Game'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default HomePage