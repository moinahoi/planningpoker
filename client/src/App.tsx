import { Routes, Route, Navigate } from 'react-router'
import HomePage from './pages/HomePage'
import GameRoom from './pages/GameRoom'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/invite/:gameId" element={<HomePage />} />
        <Route path="/game/:gameId" element={<GameRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <p className="pointer-events-none fixed bottom-1 right-2 z-30 text-[10px] text-gray-400/70">
        v{__APP_VERSION__}
      </p>
    </div>
  )
}

export default App
