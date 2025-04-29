// client/src/api.js

const URLS = process.env.REACT_APP_API_URLS
  ? process.env.REACT_APP_API_URLS.split(',')
  : ['http://10.250.121.33:8000'];
console.log('RAFT URLS:', URLS);
let current = 0;

async function raftFetch(path, options = {}) {
  for (let attempt = 0; attempt < URLS.length; attempt++) {
    const base = URLS[current];
    try {
      console.log(`→ fetching ${base}${path}`);
      const resp = await fetch(`${base}${path}`, options);
      if (!resp.ok) {
        throw new Error(`Non-OK response: ${resp.status}`);
      }
      if (resp.redirected) {
        const leaderOrigin = new URL(resp.url).origin;
        URLS[current] = leaderOrigin;
      }
      return resp;
    } catch (err) {
      console.error(`Error contacting ${base}${path}`, err);
      current = (current + 1) % URLS.length;
    }
  }
  throw new Error('All Raft nodes failed');
}

export async function createGame(playerId, mode = 'standard') {
  const resp = await raftFetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId: '', mode }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('createGame: non-OK response', resp.status, text);
    throw new Error('Failed to create game');
  }
  const data = await resp.json();
  if (!data.success) {
    console.error('createGame: success=false', data);
    throw new Error(data.message || 'Create failed');
  }
  return data.gameId;
}

export async function joinGame(playerId, existingGameId) {
  const resp = await raftFetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId: existingGameId }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('joinGame: non-OK response', resp.status, text);
    throw new Error('Failed to join game');
  }
  const data = await resp.json();
  if (!data.success) {
    console.error('joinGame: success=false', data);
    throw new Error(data.message || 'Join failed');
  }
  return data.gameId;
}

export async function getGameState(gameId) {
  const resp = await raftFetch(`/api/state/${gameId}`);
  if (!resp.ok) {
    const text = await resp.text();
    console.error('getGameState: non-OK response', resp.status, text);
    throw new Error('Failed to fetch game state');
  }
  return resp.json();
}

export async function makeMove(playerId, gameId, from, to) {
  const resp = await raftFetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId, from, to }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('makeMove: non-OK response', resp.status, text);
    throw new Error('Failed to make move');
  }
  const data = await resp.json();
  if (!data.success) {
    console.error('makeMove: success=false', data);
    throw new Error(data.message || 'Move failed');
  }
  return data.state;
}

export async function updateLobby(playerId, gameId, settings) {
  const resp = await raftFetch('/api/lobby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId, settings }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('updateLobby: non-OK response', resp.status, text);
    throw new Error('Failed to update lobby');
  }
  const data = await resp.json();
  if (!data.success) {
    console.error('updateLobby: success=false', data);
    throw new Error(data.message || 'Update lobby failed');
  }
  return data;
}

export async function setReady(playerId, gameId, ready) {
  const resp = await raftFetch('/api/ready', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, gameId, ready }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('setReady: non-OK response', resp.status, text);
    throw new Error('Failed to set ready');
  }
  const data = await resp.json();
  if (!data.success) {
    console.error('setReady: success=false', data);
    throw new Error(data.message || 'Set ready failed');
  }
  return data;
}