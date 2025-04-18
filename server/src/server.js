// server/src/server.js

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { joinOrCreate, makeMove } = require('./gameLogic');

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// ─── SQLite setup ─────────────────────────────────────────────────
const db = new sqlite3.Database(
  process.env.DB_PATH || './kungfu_chess.db',
  err => {
    if (err) console.error('DB error:', err);
  }
);
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      player1_id TEXT,
      player2_id TEXT,
      state TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS moves (
      game_id TEXT,
      player_id TEXT,
      piece TEXT,
      from_pos TEXT,
      to_pos TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ─── REST: create / join ────────────────────────────────────────────────
app.post('/api/join', async (req, res) => {
  const { playerId, gameId } = req.body;
  try {
    const result = await joinOrCreate(db, playerId, gameId);
    return res.json({ game_id: result.gameId, success: result.success, message: result.message });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// ─── REST: make move ────────────────────────────────────────────────────
app.post('/api/move', async (req, res) => {
  const { playerId, gameId, piece, fromPos, toPos } = req.body;
  try {
    const result = await makeMove(db, playerId, gameId, fromPos, toPos);
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// ─── REST: get state + metadata ────────────────────────────────────────
app.get('/api/state/:gameId', (req, res) => {
  const id = req.params.gameId;
  db.get(
    `SELECT player1_id, player2_id, state FROM games WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Game not found' });
      let stateObj;
      try {
        stateObj = JSON.parse(row.state);
      } catch {
        return res.status(500).json({ error: 'Corrupt state' });
      }
      res.json({
        ...stateObj,
        hasOpponent: !!row.player2_id,
        player1Id: row.player1_id,
        player2Id: row.player2_id,
      });
    }
  );
});

const PORT = process.env.HTTP_PORT || 8000;
app.listen(PORT, () => {
  console.log(`REST server listening on http://localhost:${PORT}`);
});