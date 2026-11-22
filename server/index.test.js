const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { io: connect } = require("socket.io-client");

console.log = () => {}; // silence server logs in test output

const { server, io, games, getGameState, calculateAverage } = require("./index");

let baseUrl;
const clients = [];

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  clients.forEach((s) => s.disconnect());
  await new Promise((resolve) => io.close(resolve)); // also closes the http server
});

// --- helpers ---------------------------------------------------------------

async function createGame() {
  const res = await fetch(`${baseUrl}/games`, { method: "POST" });
  assert.equal(res.status, 200);
  return (await res.json()).gameId;
}

function client() {
  const socket = connect(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}

// Resolves with the first event payload that matches `predicate`.
function waitFor(socket, event, predicate = () => true, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for "${event}"`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

const playerCount = (n) => (state) => Object.keys(state.players).length === n;

async function join(socket, gameId, playerName, expectedPlayers = 1) {
  const joined = waitFor(socket, "game-updated", playerCount(expectedPlayers));
  socket.emit("join-game", { gameId, playerName });
  return joined;
}

// Two independent players in a fresh game.
async function twoPlayerGame() {
  const gameId = await createGame();
  const alice = client();
  const bob = client();
  await join(alice, gameId, "Alice", 1);
  const aliceSeesBob = waitFor(alice, "game-updated", playerCount(2));
  await join(bob, gameId, "Bob", 2);
  await aliceSeesBob;
  return { gameId, alice, bob };
}

// --- pure logic ------------------------------------------------------------

describe("calculateAverage", () => {
  const game = (...cards) => ({
    players: Object.fromEntries(cards.map((card, i) => [i, { card }])),
  });

  test("averages numeric cards to one decimal", () => {
    assert.equal(calculateAverage(game(5, 8)), "6.5");
    assert.equal(calculateAverage(game(1, 2, 3)), "2.0");
  });

  test("ignores ?, coffee and unselected cards", () => {
    assert.equal(calculateAverage(game(3, "?", "☕", null)), "3.0");
  });

  test("counts 0 as a vote", () => {
    assert.equal(calculateAverage(game(0, 8)), "4.0");
  });

  test("returns null without numeric cards", () => {
    assert.equal(calculateAverage(game("?", null)), null);
    assert.equal(calculateAverage(game()), null);
  });
});

describe("getGameState", () => {
  test("hides other players' cards until revealed, shows own card", () => {
    games.g1 = {
      id: "g1",
      revealed: false,
      countdown: null,
      players: {
        a: { id: "a", name: "A", card: 5 },
        b: { id: "b", name: "B", card: null },
      },
    };
    const forA = getGameState("g1", "a");
    assert.equal(forA.players.a.card, 5);
    assert.equal(forA.players.b.card, null);
    assert.equal(getGameState("g1", "b").players.a.card, true);
    assert.equal(getGameState("g1").average, null);

    games.g1.revealed = true;
    const revealed = getGameState("g1", "b");
    assert.equal(revealed.players.a.card, 5);
    assert.equal(revealed.average, "5.0");
    delete games.g1;
  });

  test("returns null for unknown game", () => {
    assert.equal(getGameState("nope"), null);
  });
});

// --- REST API --------------------------------------------------------------

describe("REST API", () => {
  test("GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  test("POST /games creates a 6-char game id", async () => {
    const gameId = await createGame();
    assert.match(gameId, /^[\w-]{6}$/);
    assert.ok(games[gameId]);
  });

  test("GET /games/:id returns the game", async () => {
    const gameId = await createGame();
    const res = await fetch(`${baseUrl}/games/${gameId}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      id: gameId,
      players: {},
      revealed: false,
      average: null,
      countdown: null,
    });
  });

  test("GET /games/:id returns 404 for unknown game", async () => {
    const res = await fetch(`${baseUrl}/games/doesnotexist`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "Game not found" });
  });

  test("GET /games/:id hides selected cards before reveal", async () => {
    const { gameId, alice } = await twoPlayerGame();
    const updated = waitFor(alice, "game-updated", (s) => s.players[alice.id].card === 5);
    alice.emit("select-card", { card: 5 });
    await updated;
    const body = await (await fetch(`${baseUrl}/games/${gameId}`)).json();
    assert.equal(body.players[alice.id].card, true);
  });
});

// --- Socket.io: two independent players ------------------------------------

describe("socket game flow (2 players)", () => {
  test("both players see each other after joining", async () => {
    const { alice, bob } = await twoPlayerGame();
    const state = await (async () => {
      const s = waitFor(bob, "game-updated");
      bob.emit("select-card", { card: 1 }); // trigger a fresh state
      return s;
    })();
    const names = Object.values(state.players).map((p) => p.name).sort();
    assert.deepEqual(names, ["Alice", "Bob"]);
    assert.ok(state.players[alice.id]);
    assert.ok(state.players[bob.id]);
  });

  test("a selected card is visible to its owner but hidden from others", async () => {
    const { alice, bob } = await twoPlayerGame();
    const aliceState = waitFor(alice, "game-updated", (s) => s.players[alice.id].card === 8);
    const bobState = waitFor(bob, "game-updated", (s) => s.players[alice.id].card !== null);
    alice.emit("select-card", { card: 8 });
    assert.equal((await aliceState).players[alice.id].card, 8);
    assert.equal((await bobState).players[alice.id].card, true);
  });

  test("players can change their card", async () => {
    const { alice } = await twoPlayerGame();
    alice.emit("select-card", { card: 3 });
    await waitFor(alice, "game-updated", (s) => s.players[alice.id].card === 3);
    alice.emit("select-card", { card: 13 });
    await waitFor(alice, "game-updated", (s) => s.players[alice.id].card === 13);
  });

  test("start-countdown counts 3-2-1 for everyone, then reveals all cards", async () => {
    const { alice, bob } = await twoPlayerGame();
    alice.emit("select-card", { card: 5 });
    await waitFor(bob, "game-updated", (s) => s.players[alice.id].card === true);
    bob.emit("select-card", { card: 8 });
    await waitFor(alice, "game-updated", (s) => s.players[bob.id].card === true);

    const seen = [];
    bob.on("game-updated", (s) => seen.push(s.countdown));
    const aliceSees = waitFor(alice, "game-updated", (s) => s.revealed, 5000);
    const bobSees = waitFor(bob, "game-updated", (s) => s.revealed, 5000);
    bob.emit("start-countdown");
    bob.emit("start-countdown"); // double click must not speed up the countdown

    for (const state of [await aliceSees, await bobSees]) {
      assert.equal(state.countdown, null);
      assert.equal(state.players[alice.id].card, 5);
      assert.equal(state.players[bob.id].card, 8);
      assert.equal(state.average, "6.5");
    }
    assert.deepEqual(seen, [3, 2, 1, null]);
  });

  test("new-round clears all cards and the reveal for everyone", async () => {
    const { gameId, alice, bob } = await twoPlayerGame();
    alice.emit("select-card", { card: 5 });
    await waitFor(alice, "game-updated", (s) => s.players[alice.id].card === 5);
    games[gameId].revealed = true; // skip the 3s countdown

    const allCleared = (s) => Object.values(s.players).every((p) => p.card === null);
    const bobSees = waitFor(bob, "game-updated", allCleared);
    bob.emit("new-round");
    const state = await bobSees;
    assert.equal(state.revealed, false);
    assert.equal(state.average, null);
    assert.equal(state.countdown, null);
  });

  test("leaving removes the player for the others", async () => {
    const { gameId, alice, bob } = await twoPlayerGame();
    const aliceSees = waitFor(alice, "game-updated", playerCount(1));
    bob.disconnect();
    const state = await aliceSees;
    assert.deepEqual(Object.keys(state.players), [alice.id]);
    assert.ok(games[gameId]);
  });

  test("the game is deleted when the last player leaves", async () => {
    const { gameId, alice, bob } = await twoPlayerGame();
    bob.disconnect();
    await waitFor(alice, "game-updated", playerCount(1));
    alice.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(games[gameId], undefined);
    assert.equal((await fetch(`${baseUrl}/games/${gameId}`)).status, 404);
  });

  test("rejoining with the same name replaces the old player", async () => {
    const { gameId, alice } = await twoPlayerGame();
    const aliceAgain = client();
    const state = await join(aliceAgain, gameId, "Alice", 2);
    const names = Object.values(state.players).map((p) => p.name).sort();
    assert.deepEqual(names, ["Alice", "Bob"]);
    assert.equal(state.players[alice.id], undefined);
    assert.ok(state.players[aliceAgain.id]);
  });
});

describe("socket errors", () => {
  test("joining an unknown game", async () => {
    const s = client();
    const err = waitFor(s, "error");
    s.emit("join-game", { gameId: "nope", playerName: "X" });
    assert.deepEqual(await err, { message: "Game not found" });
  });

  for (const event of ["select-card", "start-countdown", "new-round"]) {
    test(`${event} without joining`, async () => {
      const s = client();
      const err = waitFor(s, "error");
      s.emit(event, { card: 5 });
      assert.deepEqual(await err, { message: "Not in an active game" });
    });
  }

  test("invalid card value", async () => {
    const { alice } = await twoPlayerGame();
    for (const card of [4, "5", "x", null]) {
      const err = waitFor(alice, "error");
      alice.emit("select-card", { card });
      assert.deepEqual(await err, { message: "Invalid card value" });
    }
  });
});
