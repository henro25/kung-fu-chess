// client/src/api.js

const BASE = 'http://localhost:8000';

export async function createGame(playerId, mode = 'standard') {
  const resp = await fetch(`${BASE}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId: '', mode }),
  });
  if (!resp.ok) throw new Error('Failed to create game');
  const data = await resp.json();
  if (!data.success) throw new Error(data.message || 'Create failed');
  return data.gameId;
}

export async function joinGame(playerId, existingGameId) {
  const resp = await fetch(`${BASE}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId: existingGameId }),
  });
  if (!resp.ok) throw new Error('Failed to join game');
  const data = await resp.json();
  if (!data.success) throw new Error(data.message || 'Join failed');
  return data.gameId;
}

export async function getGameState(gameId) {
  const resp = await fetch(`${BASE}/api/state/${gameId}`);
  if (!resp.ok) throw new Error('Failed to fetch game state');
  return resp.json();
}

export async function makeMove(playerId, gameId, from, to) {
  const resp = await fetch(`${BASE}/api/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId, from, to }),
  });
  if (!resp.ok) throw new Error('Failed to make move');
  return resp.json();
}