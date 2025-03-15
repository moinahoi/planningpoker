const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your frontend URL
    methods: ['GET', 'POST']
  },
  path: '/api/socket.io' // Set the base path
});

const PORT = process.env.PORT || 8000; // Changed default port from 5000 to 8000

// Store active games
const games = {};

// Card values for planning poker (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, coffee)
const validCards = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?', '☕'];

// Create a new game
app.post('/games', (req, res) => {
  const gameId = nanoid(6); // Generate a short, unique game ID
  
  games[gameId] = {
    id: gameId,
    players: {},
    revealed: false,
    createdAt: Date.now()
  };
  
  res.json({ gameId });
});

// Health check endpoint for Coolify
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Get game status
app.get('/games/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = games[gameId];
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  // Return game data without revealing cards unless the game state is "revealed"
  const sanitizedPlayers = {};
  Object.keys(game.players).forEach(playerId => {
    const player = game.players[playerId];
    sanitizedPlayers[playerId] = {
      ...player,
      card: game.revealed ? player.card : (player.card !== null ? true : null)
    };
  });
  
  res.json({
    id: game.id,
    players: sanitizedPlayers,
    revealed: game.revealed,
    average: game.revealed ? calculateAverage(game) : null
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  let currentGameId = null;
  let currentPlayer = null;

  // Join a game
  socket.on('join-game', ({ gameId, playerName }) => {
    // Check if game exists
    if (!games[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    currentGameId = gameId;
    
    // Check if a player with the same name already exists in this game
    const existingPlayerIds = Object.keys(games[gameId].players);
    const existingPlayerWithSameName = existingPlayerIds.find(
      id => games[gameId].players[id].name === playerName && games[gameId].players[id].id !== socket.id
    );
    
    if (existingPlayerWithSameName) {
      // If player with same name exists, remove the old entry
      delete games[gameId].players[existingPlayerWithSameName];
      console.log(`Replaced duplicate player ${playerName} in game ${gameId}`);
    }
    
    currentPlayer = {
      id: socket.id,
      name: playerName,
      card: null
    };

    // Add player to the game
    games[gameId].players[socket.id] = currentPlayer;
    
    // Join the socket room for this game
    socket.join(gameId);
    
    // Notify everyone in the game about the new player
    io.to(gameId).emit('game-updated', getGameState(gameId));
    console.log(`Player ${playerName} joined game ${gameId}`);
  });

  // Player selects a card
  socket.on('select-card', ({ card }) => {
    if (!currentGameId || !currentPlayer || !games[currentGameId]) {
      socket.emit('error', { message: 'Not in an active game' });
      return;
    }

    // Validate card value
    if (!validCards.includes(card)) {
      socket.emit('error', { message: 'Invalid card value' });
      return;
    }

    // Make sure the player exists in the game
    if (!games[currentGameId].players[socket.id]) {
      console.log(`Player ${socket.id} not found in game ${currentGameId}`);
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }

    // Update player's card
    games[currentGameId].players[socket.id].card = card;
    
    // Notify all players in the game
    io.to(currentGameId).emit('game-updated', getGameState(currentGameId));
    console.log(`Player ${currentPlayer.name} selected card ${card}`);
  });

  // Reveal all cards
  socket.on('reveal-cards', () => {
    if (!currentGameId || !games[currentGameId]) {
      socket.emit('error', { message: 'Not in an active game' });
      return;
    }

    games[currentGameId].revealed = true;
    
    // Calculate and include the average in the game state
    const gameState = getGameState(currentGameId);
    
    // Notify all players in the game
    io.to(currentGameId).emit('game-updated', gameState);
    console.log(`Cards revealed in game ${currentGameId}`);
  });

  // Start a new round
  socket.on('new-round', () => {
    if (!currentGameId || !games[currentGameId]) {
      socket.emit('error', { message: 'Not in an active game' });
      return;
    }

    // Reset all cards and revealed state
    games[currentGameId].revealed = false;
    Object.keys(games[currentGameId].players).forEach(playerId => {
      games[currentGameId].players[playerId].card = null;
    });
    
    // Notify all players in the game
    io.to(currentGameId).emit('game-updated', getGameState(currentGameId));
    console.log(`New round started in game ${currentGameId}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    if (currentGameId && games[currentGameId]) {
      // Remove player from the game
      delete games[currentGameId].players[socket.id];
      
      // If no players left, clean up the game
      if (Object.keys(games[currentGameId].players).length === 0) {
        delete games[currentGameId];
        console.log(`Game ${currentGameId} removed (no players left)`);
      } else {
        // Notify remaining players
        io.to(currentGameId).emit('game-updated', getGameState(currentGameId));
        console.log(`Player ${currentPlayer?.name || socket.id} left game ${currentGameId}`);
      }
    }
  });
});

// Helper function to get sanitized game state
function getGameState(gameId) {
  const game = games[gameId];
  if (!game) return null;
  
  const sanitizedPlayers = {};
  Object.keys(game.players).forEach(playerId => {
    const player = game.players[playerId];
    sanitizedPlayers[playerId] = {
      ...player,
      card: game.revealed ? player.card : (player.card !== null ? true : null)
    };
  });
  
  return {
    id: game.id,
    players: sanitizedPlayers,
    revealed: game.revealed,
    average: game.revealed ? calculateAverage(game) : null
  };
}

// Helper function to calculate the average of revealed cards
function calculateAverage(game) {
  const cards = Object.values(game.players)
    .map(player => player.card)
    .filter(card => card !== null && typeof card === 'number');
  
  if (cards.length === 0) return null;
  
  const sum = cards.reduce((acc, card) => acc + card, 0);
  return (sum / cards.length).toFixed(1);
}

// Clean up old games periodically (every hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  Object.keys(games).forEach(gameId => {
    if (now - games[gameId].createdAt > oneHour) {
      delete games[gameId];
      console.log(`Game ${gameId} removed (expired)`);
    }
  });
}, 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});