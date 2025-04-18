const crypto = require('crypto');

// ─── Helpers ─────────────────────────────────────────────────────────────

function parsePos(pos) {
  return { c: pos.charCodeAt(0) - 97, r: parseInt(pos[1], 10) - 1 };
}
function encodePos(c, r) {
  return String.fromCharCode(97 + c) + (r + 1);
}
function buildPath(from, to) {
  // still used for path‑validation
  const A = parsePos(from), B = parsePos(to);
  const dc = Math.sign(B.c - A.c), dr = Math.sign(B.r - A.r);
  const steps = Math.max(Math.abs(B.c - A.c), Math.abs(B.r - A.r));
  const path = [];
  for (let i = 1; i <= steps; i++) {
    path.push(encodePos(A.c + dc * i, A.r + dr * i));
  }
  return path;
}
function clearPath(board, from, to) {
  const mid = buildPath(from, to).slice(0, -1);
  return mid.every(p => !board[p]);
}

// ─── Initial State ───────────────────────────────────────────────────────

function initBoard() {
  const b = {};
  const wb = ['wR','wN','wB','wQ','wK','wB','wN','wR'];
  const bb = ['bR','bN','bB','bQ','bK','bB','bN','bR'];
  for (let i = 0; i < 8; i++) {
    const f = String.fromCharCode(97 + i);
    b[`${f}1`] = wb[i];
    b[`${f}2`] = 'wP';
    b[`${f}7`] = 'bP';
    b[`${f}8`] = bb[i];
  }
  return b;
}

function initState(mode) {
  const cfg = mode === 'lightning'
    ? { speed: 5, cooldown: 200 }
    : { speed: 1, cooldown: 2000 };  // 2s cooldown for “snap‑and‑cooldown”
  return {
    board: initBoard(),
    players: [],
    cooldowns: {},    // pos → timestamp when piece at that pos is ready again
    mode,
    cfg,
    status: 'waiting',
    winner: null
  };
}

// ─── Move validation ─────────────────────────────────────────────────────

function validateBasic(from, to, state, playerColor) {
  const b = state.board, pc = b[from];
  if (!pc) return false;
  const color = pc[0] === 'w' ? 'white' : 'black';
  if (color !== playerColor) return false;
  if (b[to] && b[to][0] === pc[0]) return false;

  const A = parsePos(from), B = parsePos(to);
  const dc = B.c - A.c, dr = B.r - A.r;
  const absC = Math.abs(dc), absR = Math.abs(dr);

  switch (pc[1]) {
    case 'P': {
      const dir = color === 'white' ? 1 : -1;
      if (dc === 0) {
        if (dr === dir && !b[to]) break;
        if (
          dr === 2*dir &&
          ((A.r===1&&color==='white')||(A.r===6&&color==='black')) &&
          !b[to] &&
          !b[encodePos(A.c, A.r+dir)]
        ) break;
        return false;
      }
      if (absC===1 && dr===dir && b[to]) break;
      return false;
    }
    case 'N':
      if (!((absC===1&&absR===2)||(absC===2&&absR===1))) return false;
      break;
    case 'B':
      if (absC!==absR || !clearPath(b, from, to)) return false;
      break;
    case 'R':
      if (!(dc===0||dr===0) || !clearPath(b, from, to)) return false;
      break;
    case 'Q':
      if (!(((dc===0||dr===0)||absC===absR) && clearPath(b, from, to))) return false;
      break;
    case 'K':
      if (Math.max(absC,absR)>1) return false;
      break;
    default:
      return false;
  }

  // cooldown
  if (Date.now() < (state.cooldowns[from] || 0)) return false;
  return true;
}

// ─── Join or Create ──────────────────────────────────────────────────────

function joinOrCreate(db, playerId, gameId, mode='standard') {
  return new Promise((res, rej) => {
    if (!gameId) {
      const newId = crypto.randomBytes(3).toString('hex');
      const st = initState(mode);
      st.players = [playerId];
      db.run(
        `INSERT INTO games (id, player1_id, state) VALUES(?,?,?)`,
        [newId, playerId, JSON.stringify(st)],
        err => err ? rej(err) : res({gameId:newId,success:true})
      );
    } else {
      db.get(
        `SELECT player1_id,player2_id,state FROM games WHERE id=?`,
        [gameId],
        (e,row) => {
          if (e) return rej(e);
          if (!row) return res({gameId,success:false,message:'Not found'});
          const st = JSON.parse(row.state);
          if (!st.players.includes(playerId)) {
            if (st.players.length<2) st.players.push(playerId);
            else return res({gameId,success:false,message:'Full'});
          }
          st.status = st.players.length===2?'ongoing':'waiting';
          // also store player2_id for validation
          const upd = st.players.length===2
            ? `UPDATE games SET state=?,player2_id=? WHERE id=?`
            : `UPDATE games SET state=? WHERE id=?`;
          const args = st.players.length===2
            ? [JSON.stringify(st), st.players[1], gameId]
            : [JSON.stringify(st), gameId];
          db.run(upd, args, err2 => err2?rej(err2):res({gameId,success:true}));
        }
      );
    }
  });
}

// ─── MakeMove ────────────────────────────────────────────────────────────

function makeMove(db, playerId, gameId, from, to) {
  return new Promise((res, rej) => {
    db.get(
      `SELECT player1_id,player2_id,state FROM games WHERE id=?`,
      [gameId],
      (e,row) => {
        if (e) return rej(e);
        if (!row) return res({success:false,message:'Game not found'});
        const st = JSON.parse(row.state);

        if (st.status==='ended') {
          return res({success:false,message:'Game over'});
        }

        const color = row.player1_id===playerId
          ? 'white'
          : row.player2_id===playerId
          ? 'black'
          : null;
        if (!color) return res({success:false,message:'Not in game'});

        if (!validateBasic(from,to,st,color)) {
          return res({success:false,message:'Invalid or cooling down'});
        }

        // **SNAP**: move immediately
        const pc = st.board[from];
        delete st.board[from];
        st.board[to] = pc;

        // start cooldown on the new square
        st.cooldowns[to] = Date.now() + st.cfg.cooldown;

        db.run(
          `UPDATE games SET state=? WHERE id=?`,
          [JSON.stringify(st), gameId],
          err2 => err2?rej(err2):res({success:true})
        );
      }
    );
  });
}

// ─── Tick updater (no longer needed for movement) ────────────────────────

function tick(state) {
  // do nothing: all movement is instantaneous
}

module.exports = {
  joinOrCreate,
  makeMove,
  tick
};