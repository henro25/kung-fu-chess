// server/src/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const { joinOrCreate, makeMove, tick } = require('./gameLogic');

const app = express();
app.use(cors({origin:'*'}));
app.use(bodyParser.json());

const db = new sqlite3.Database('./kungfu.db',e=>e&&console.error(e));
db.serialize(()=>{
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      player1_id TEXT,
      player2_id TEXT,
      state TEXT
    )`);
});

// REST endpoints
app.post('/api/join',(req,res)=>{
  const { playerId, gameId, mode } = req.body;
  joinOrCreate(db,playerId,gameId,mode)
    .then(r=>res.json(r)).catch(e=>res.status(500).json({error:e.message}));
});
app.post('/api/move',(req,res)=>{
  const { playerId, gameId, from, to } = req.body;
  makeMove(db,playerId,gameId,from,to)
    .then(r=>res.json(r)).catch(e=>res.status(500).json({error:e.message}));
});
app.get('/api/state/:id',(req,res)=>{
  db.get(`SELECT state FROM games WHERE id=?`,[req.params.id],(e,row)=>{
    if(e) return res.status(500).json({error:e.message});
    if(!row) return res.status(404).json({error:'Not found'});
    res.json(JSON.parse(row.state));
  });
});

const PORT=8000;
app.listen(PORT,()=>console.log(`Listening ${PORT}`));

// Periodic tick: now using db.all instead of db.get
setInterval(() => {
  db.all(
    `SELECT id, state FROM games`,
    [],
    (err, rows) => {
      if (err) return console.error(err);
      // rows is now an array
      rows.forEach(r => {
        const st = JSON.parse(r.state);
        if (st.status === 'ongoing' || st.status === 'waiting') {
          tick(st);
          db.run(
            `UPDATE games SET state = ? WHERE id = ?`,
            [JSON.stringify(st), r.id],
            (e) => {
              if (e) console.error('Failed to save tick:', e);
            }
          );
        }
      });
    }
  );
}, 300);