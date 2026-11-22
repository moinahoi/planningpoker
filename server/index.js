const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }, // restrict to the frontend URL if exposed publicly
  path: "/socket.io",
});

const PORT = process.env.PORT || 8000;
// CI bakes the release tag into the image as APP_VERSION
const VERSION = process.env.APP_VERSION || require("./package.json").version;
const GAME_TTL_MS = 60 * 60 * 1000;
const VALID_CARDS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, "?", "☕"];

// In-memory store: gameId -> { id, players: { socketId: { id, name, card } }, revealed, countdown, createdAt }
const games = {};

app.post("/games", (req, res) => {
  const gameId = crypto.randomBytes(6).toString("base64url").slice(0, 6);
  games[gameId] = {
    id: gameId,
    players: {},
    revealed: false,
    createdAt: Date.now(),
    countdown: null,
  };
  res.json({ gameId });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: VERSION });
});

app.get("/games/:gameId", (req, res) => {
  const state = getGameState(req.params.gameId);
  if (!state) return res.status(404).json({ error: "Game not found" });
  res.json(state);
});

io.on("connection", (socket) => {
  let gameId = null;
  let playerName = null;

  const game = () => games[gameId];
  const broadcast = () => io.to(gameId).emit("game-updated", getGameState(gameId));
  // The acting player sees their own card; everyone else sees it hidden.
  const broadcastFrom = () => {
    socket.emit("game-updated", getGameState(gameId, socket.id));
    socket.to(gameId).emit("game-updated", getGameState(gameId));
  };
  const requireGame = () => {
    if (game()) return true;
    socket.emit("error", { message: "Not in an active game" });
    return false;
  };

  socket.on("join-game", ({ gameId: requestedId, playerName: name }) => {
    const target = games[requestedId];
    if (!target) {
      socket.emit("error", { message: "Game not found" });
      return;
    }

    gameId = requestedId;
    playerName = name;

    // A reload reconnects with a new socket id: replace the stale entry with the same name.
    for (const [id, player] of Object.entries(target.players)) {
      if (player.name === name && id !== socket.id) delete target.players[id];
    }

    target.players[socket.id] = { id: socket.id, name, card: null };
    socket.join(gameId);
    broadcastFrom();
    console.log(`Player ${name} joined game ${gameId}`);
  });

  socket.on("select-card", ({ card }) => {
    if (!requireGame()) return;
    if (!VALID_CARDS.includes(card)) {
      socket.emit("error", { message: "Invalid card value" });
      return;
    }
    const player = game().players[socket.id];
    if (!player) {
      socket.emit("error", { message: "Player not found in game" });
      return;
    }
    player.card = card;
    broadcastFrom();
  });

  socket.on("start-countdown", () => {
    if (!requireGame() || game().countdown) return; // ignore double clicks

    const id = gameId;
    games[id].countdown = 3;
    broadcast();

    const timer = setInterval(() => {
      const current = games[id];
      if (!current) return clearInterval(timer);

      current.countdown--;
      if (current.countdown <= 0) {
        clearInterval(timer);
        current.countdown = null;
        current.revealed = true;
      }
      io.to(id).emit("game-updated", getGameState(id));
    }, 1000);
  });

  socket.on("new-round", () => {
    if (!requireGame()) return;
    const current = game();
    current.revealed = false;
    current.countdown = null;
    for (const player of Object.values(current.players)) player.card = null;
    broadcast();
  });

  socket.on("disconnect", () => {
    const current = game();
    if (!current) return;

    delete current.players[socket.id];
    const remaining = Object.keys(current.players);
    if (remaining.length === 0) {
      delete games[gameId];
      console.log(`Game ${gameId} removed (no players left)`);
      return;
    }
    // Every socket sits in a room named after its id: send each player their own view.
    for (const id of remaining) io.to(id).emit("game-updated", getGameState(gameId, id));
    console.log(`Player ${playerName ?? socket.id} left game ${gameId}`);
  });
});

// Game state as seen by `forPlayerId`: other players' cards stay hidden (true) until revealed.
function getGameState(gameId, forPlayerId = null) {
  const game = games[gameId];
  if (!game) return null;

  const players = {};
  for (const [id, player] of Object.entries(game.players)) {
    const visible = game.revealed || id === forPlayerId;
    players[id] = { ...player, card: visible || player.card === null ? player.card : true };
  }

  return {
    id: game.id,
    players,
    revealed: game.revealed,
    average: game.revealed ? calculateAverage(game) : null,
    countdown: game.countdown,
  };
}

// Average of numeric cards, one decimal; "?" and "☕" don't count.
function calculateAverage(game) {
  const cards = Object.values(game.players)
    .map((player) => player.card)
    .filter((card) => typeof card === "number");
  if (cards.length === 0) return null;
  return (cards.reduce((sum, card) => sum + card, 0) / cards.length).toFixed(1);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, game] of Object.entries(games)) {
    if (now - game.createdAt > GAME_TTL_MS) {
      delete games[id];
      console.log(`Game ${id} removed (expired)`);
    }
  }
}, GAME_TTL_MS).unref(); // unref: don't keep test processes alive

if (require.main === module) {
  server.listen(PORT, () => console.log(`Planning Poker server v${VERSION} running on port ${PORT}`));
}

module.exports = { app, server, io, games, getGameState, calculateAverage };
