// client/src/api.js

const BASE = 'http://10.250.121.33:8000';

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

export async function updateLobby(playerId, gameId, settings) {
  const resp = await fetch(`${BASE}/api/lobby`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ playerId, gameId, settings })
  });
  if (!resp.ok) throw new Error('Failed to update lobby');
  return resp.json();
}

export async function setReady(playerId, gameId, ready) {
  const resp = await fetch(`${BASE}/api/ready`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ playerId, gameId, ready })
  });
  if (!resp.ok) throw new Error('Failed to set ready');
  return resp.json();
}