// client/src/grpc/gameClient.js

export async function joinGame(playerId, gameId) {
  const resp = await fetch('http://localhost:8000/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId }),
  });
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || `HTTP ${resp.status}`);
  }
  return await resp.json(); // { game_id, success, message }
}

export async function makeMove(playerId, gameId, piece, fromPos, toPos) {
  const resp = await fetch('http://localhost:8000/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId, piece, fromPos, toPos }),
  });
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || `HTTP ${resp.status}`);
  }
  return await resp.json(); // { success, message }
}

export async function getGameState(gameId) {
  const resp = await fetch(`http://localhost:8000/api/state/${gameId}`);
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || `HTTP ${resp.status}`);
  }
  return await resp.json(); // includes board, turn, cooldowns, etc
}