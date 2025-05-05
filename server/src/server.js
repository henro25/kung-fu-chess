// server/src/server.js
const express   = require('express');
const sqlite3   = require('sqlite3').verbose();
const bodyParser= require('body-parser');
const cors      = require('cors');
const RaftNode  = require('./raft');
const { tick } = require('./gameLogic');
const crypto = require('crypto');
const DB_PATH = process.env.DB_PATH

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// SQLite setup
const gamesDb = new sqlite3.Database(DB_PATH, e => { if (e) console.error(e); });
gamesDb.serialize(() => {
  gamesDb.run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      player1_id TEXT,
      player2_id TEXT,
      state TEXT
    )
  `);
});

// Initialize Raft node; 
const raft = new RaftNode({
  id:       process.env.NODE_ID,
  peers:    process.env.PEERS.split(','),  // Already configured with correct 9000-9004 ports
  dbPath:   DB_PATH,
  raftPort: Number(process.env.RAFT_PORT), 
  gamesDb,
});
// Helper to extract leader URL from error message
function extractLeader(err) {
  // err.message expected: "Not leader <leaderUrl>"
  const prefix = 'Not leader ';
  if (err.message.startsWith(prefix)) {
    return err.message.slice(prefix.length).trim();
  }
  return null;
}

// create or join
app.post('/api/join', (req, res) => {
  console.log(`[${process.env.NODE_ID}] GOT /api/join`, req.body);
  let { playerId, gameId, mode } = req.body;

  // If no gameId, we're creating a brand-new game:
  if (!gameId) {
    gameId = crypto.randomBytes(3).toString('hex');
  }

  console.log(`[${process.env.NODE_ID}] Current state:`, raft.state);
  console.log(`[${process.env.NODE_ID}] Current leader:`, raft.leaderId);

  // Propose a *single* createGame command, with freshly made ID
  raft.propose({
    type: 'createOrJoinGame',
    args: { playerId, gameId, mode }
  })
  .then(result => {
    console.log(`[${process.env.NODE_ID}] Propose success:`, result);
    if (!result || !result.success) {
      return res.status(400).json({ error: result?.message || 'Failed to create game' });
    }
    res.json(result);
  })
  .catch(err => {
    console.error(`[${process.env.NODE_ID}] Propose error:`, err.message);
    const leader = extractLeader(err);
    if (leader) {
      const redirectTo = leader + req.originalUrl;
      console.log(`[${process.env.NODE_ID}] Redirecting to leader URL: ${redirectTo}`);
      return res.status(307).set('Location', redirectTo).json({ leader: redirectTo });
    } else {
      res.status(500).json({ error: err.message });
    }
  });
});

// update lobby settings
app.post('/api/lobby', (req, res) => {
  console.log(`[${process.env.NODE_ID}] POST /api/lobby`, req.body);
  const { playerId, gameId, settings } = req.body;
  raft.propose({ type: 'lobby', args: { playerId, gameId, settings } })
    .then(result => {
      console.log(`[${process.env.NODE_ID}] /api/lobby →`, result);
      res.json(result);
    })
    .catch(err => {
      console.error(`[${process.env.NODE_ID}] /api/lobby ERROR →`, err.message);
      const leader = extractLeader(err);
      if (leader) {
        // Build the full redirect URL, preserving the original path
        const redirectTo = leader + req.originalUrl;
        console.log(`[${process.env.NODE_ID}] Redirecting to leader URL: ${redirectTo}`);
        return res.status(307).set('Location', redirectTo).json({ leader: redirectTo });
      } else {
        res.status(500).json({ error: err.message });
      }
    });
});

// toggle ready
app.post('/api/ready', (req, res) => {
  console.log(`[${process.env.NODE_ID}] POST /api/ready`, req.body);
  const { playerId, gameId, ready } = req.body;
  raft.propose({ type: 'ready', args: { playerId, gameId, ready } })
    .then(result => {
      console.log(`[${process.env.NODE_ID}] /api/ready →`, result);
      res.json(result);
    })
    .catch(err => {
      console.error(`[${process.env.NODE_ID}] /api/ready ERROR →`, err.message);
      const leader = extractLeader(err);
      if (leader) {
        const redirectTo = leader + req.originalUrl;
        console.log(`[${process.env.NODE_ID}] Redirecting to leader URL: ${redirectTo}`);
        return res.status(307).set('Location', redirectTo).json({ leader: redirectTo });
      } else {
        res.status(500).json({ error: err.message });
      }
    });
});

// make a move
app.post('/api/move', (req, res) => {
  console.log(`[${process.env.NODE_ID}] POST /api/move`, req.body);
  const { playerId, gameId, from, to } = req.body;
  raft.propose({ type: 'move', args: { playerId, gameId, from, to } })
    .then(result => {
      console.log(`[${process.env.NODE_ID}] /api/move →`, result);
      res.json(result);
    })
    .catch(err => {
      console.error(`[${process.env.NODE_ID}] /api/move ERROR →`, err.message);
      const leader = extractLeader(err);
      if (leader) {
        const redirectTo = leader + req.originalUrl;
        console.log(`[${process.env.NODE_ID}] Redirecting to leader URL: ${redirectTo}`);
        return res.status(307).set('Location', redirectTo).json({ leader: redirectTo });
      } else {
        res.status(500).json({ error: err.message });
      }
    });
});

// get state
app.get('/api/state/:id', (req, res) => {
  console.log(`[${process.env.NODE_ID}] GET /api/state/${req.params.id}`);
  gamesDb.get(`SELECT state FROM games WHERE id=?`, [req.params.id], (e, row) => {
    if (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(JSON.parse(row.state));
  });
});

// start HTTP API
const PORT = Number(process.env.PORT) || 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`[${process.env.NODE_ID}] Listening on ${PORT}`));

// optional periodic tick
setInterval(() => {
  gamesDb.all(`SELECT id, state FROM games`, [], (err, rows) => {
    if (err) return console.error(err);
    rows.forEach(r => {
      const st = JSON.parse(r.state);
      if (st.status === 'ongoing' || st.status === 'waiting') {
        tick(st);
        gamesDb.run(
          `UPDATE games SET state=? WHERE id=?`,
          [JSON.stringify(st), r.id],
          e2 => { if (e2) console.error('Tick save failed:', e2); }
        );
      }
    });
  });
}, 300);
