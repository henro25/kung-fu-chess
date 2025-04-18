// server/src/gameLogic.js
const crypto = require('crypto');

// ─── Helpers ─────────────────────────────────────────────────────────────

function parsePos(pos) {
  return { c: pos.charCodeAt(0) - 97, r: parseInt(pos[1], 10) - 1 };
}
function encodePos(c, r) {
  return String.fromCharCode(97 + c) + (r + 1);
}
function buildPath(from, to) {
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
    : { speed: 1, cooldown: 2000 };
  return {
    board: initBoard(),
    players: [],
    cooldowns: {},    // square → timestamp
    enPassant: null,  // target square for en passant
    castlingRights: {
      whiteKing: true,
      whiteQueen: true,
      blackKing: true,
      blackQueen: true
    },
    mode,
    cfg,
    status: 'waiting',
    winner: null
  };
}

// ─── Move validation ─────────────────────────────────────────────────────

function validateBasic(from, to, st, playerColor) {
  const b = st.board, pc = b[from];
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
      // straight
      if (dc === 0) {
        if (dr === dir && !b[to]) break;
        if (
          dr === 2*dir &&
          ((A.r===1&&color==='white')||(A.r===6&&color==='black')) &&
          !b[to] &&
          !b[encodePos(A.c, A.r + dir)]
        ) break;
        return false;
      }
      // diagonal capture or en passant
      if (absC===1 && dr===dir && (b[to] || to === st.enPassant)) break;
      return false;
    }
    case 'N':
      if (!((absC===1&&absR===2)||(absC===2&&absR===1))) return false;
      break;
    case 'B':
      if (absC!==absR || !clearPath(b, from, to)) return false;
      break;
    case 'R':
      if (!( (dc===0||dr===0) && clearPath(b, from, to) )) return false;
      break;
    case 'Q':
      if (!(((dc===0||dr===0)||absC===absR) && clearPath(b,from,to))) return false;
      break;
    case 'K': {
      if (Math.max(absC,absR)===1) break;
      // castling attempt
      if (dr===0 && absC===2) {
        const rank = color==='white'?'1':'8';
        const rights = color==='white'
          ? st.castlingRights.whiteKing && st.castlingRights.whiteQueen
          : st.castlingRights.blackKing && st.castlingRights.blackQueen;
        if (!rights) return false;
        const between = dc>0
          ? ['f','g'].map(f=>f+rank)
          : ['b','c','d'].map(f=>f+rank);
        if (between.some(sq=>b[sq])) return false;
        return true;
      }
      return false;
    }
    default:
      return false;
  }

  if (Date.now() < (st.cooldowns[from]||0)) return false;
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
          const upd = st.players.length===2
            ? `UPDATE games SET state=?,player2_id=? WHERE id=?`
            : `UPDATE games SET state=? WHERE id=?`;
          const args = st.players.length===2
            ? [JSON.stringify(st), st.players[1], gameId]
            : [JSON.stringify(st), gameId];
          db.run(upd, args, err2=>err2?rej(err2):res({gameId,success:true}));
        }
      );
    }
  });
}

// ─── MakeMove (snap,& cooldown & special rules & king‐capture) ───────────

function makeMove(db, playerId, gameId, from, to) {
  return new Promise((res, rej) => {
    db.get(
      `SELECT player1_id,player2_id,state FROM games WHERE id=?`,
      [gameId],
      (e,row) => {
        if (e) return rej(e);
        if (!row) return res({success:false,message:'Game not found'});
        const st = JSON.parse(row.state);
        if (st.status==='ended') return res({success:false,message:'Game over'});

        const color = row.player1_id===playerId
          ? 'white'
          : row.player2_id===playerId
          ? 'black'
          : null;
        if (!color) return res({success:false,message:'Not in game'});
        if (!validateBasic(from,to,st,color)) {
          return res({success:false,message:'Invalid or cooling down'});
        }

        const piece = st.board[from];
        const A = parsePos(from), B = parsePos(to);
        const dc = B.c - A.c;

        // track if a capture kills the king
        let didKillKing = false;

        // === Castling ===
        if (piece[1]==='K' && Math.abs(dc)===2) {
          const rank = color==='white'?'1':'8';
          delete st.board[from];
          st.board[to] = piece;

          // rook side
          let rookFrom, rookTo;
          if (dc===2) {
            rookFrom = 'h'+rank;
            rookTo   = 'f'+rank;
          } else {
            rookFrom = 'a'+rank;
            rookTo   = 'd'+rank;
          }
          // move rook
          if (st.board[rookTo] && st.board[rookTo][1]==='K') {
            // impossible, but just in case
          }
          delete st.board[rookFrom];
          st.board[rookTo] = (color==='white'?'w':'b')+'R';

          // revoke rights
          if (color==='white') {
            st.castlingRights.whiteKing = false;
            st.castlingRights.whiteQueen = false;
          } else {
            st.castlingRights.blackKing = false;
            st.castlingRights.blackQueen = false;
          }

          // cooldown both
          const readyAt = Date.now() + st.cfg.cooldown;
          st.cooldowns[to] = readyAt;
          st.cooldowns[rookTo] = readyAt;
        } else {
          // === en passant capture ===
          if (piece[1]==='P' && to===st.enPassant && !st.board[to]) {
            const dir = color==='white'? -1:1;
            const cap = encodePos(B.c, B.r+dir);
            // if that was a king (impossible) handle, else remove
            if (st.board[cap] && st.board[cap][1]==='K') {
              didKillKing = true;
            }
            delete st.board[cap];
          }
          // normal destination capture
          if (st.board[to] && st.board[to][1]==='K') {
            didKillKing = true;
          }

          // move & promotion
          delete st.board[from];
          st.board[to] = piece;
          if (
            piece[1]==='P' &&
            ((color==='white'&&to[1]==='8')||(color==='black'&&to[1]==='1'))
          ) {
            st.board[to] = (color==='white'?'w':'b')+'Q';
          }

          // revoke castling rights if needed
          if (piece[1]==='K') {
            if (color==='white') {
              st.castlingRights.whiteKing = false;
              st.castlingRights.whiteQueen = false;
            } else {
              st.castlingRights.blackKing = false;
              st.castlingRights.blackQueen = false;
            }
          }
          if (piece[1]==='R') {
            const f = from[0], rnk = from[1];
            if (color==='white'&&rnk==='1') {
              if (f==='a') st.castlingRights.whiteQueen = false;
              if (f==='h') st.castlingRights.whiteKing = false;
            }
            if (color==='black'&&rnk==='8') {
              if (f==='a') st.castlingRights.blackQueen = false;
              if (f==='h') st.castlingRights.blackKing = false;
            }
          }

          // set en passant target
          st.enPassant = null;
          if (piece[1]==='P' && Math.abs(B.r-A.r)===2) {
            const mid = A.r + Math.sign(B.r-A.r);
            st.enPassant = encodePos(A.c, mid);
          }

          // cooldown on to
          st.cooldowns[to] = Date.now() + st.cfg.cooldown;
        }

        // if the king was captured, end the game
        if (didKillKing) {
          st.status = 'ended';
          st.winner = playerId;
        }

        // save
        db.run(
          `UPDATE games SET state=? WHERE id=?`,
          [JSON.stringify(st), gameId],
          err2 => err2?rej(err2):res({success:true})
        );
      }
    );
  });
}

// ─── Tick updater (unused) ────────────────────────────────────────────────

function tick(_state) {}

module.exports = {
  joinOrCreate,
  makeMove,
  tick
};