import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import GameRoom from './pages/GameRoom'

function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading resources
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-primary-600">Planning Poker</h1>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/invite/:gameId" element={<HomePage />} />
        <Route path="/game/:gameId" element={<GameRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App