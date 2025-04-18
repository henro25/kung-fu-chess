// server/src/gameLogic.js

const crypto = require('crypto');

// ─── Helpers for positions ────────────────────────────────────────────────

function parsePos(pos) {
  return {
    col: pos.charCodeAt(0) - 97,
    row: parseInt(pos[1], 10) - 1  // 0‑7
  };
}

function encodePos(col, row) {
  return String.fromCharCode(97 + col) + (row + 1);
}

function inBounds(col, row) {
  return col >= 0 && col < 8 && row >= 0 && row < 8;
}

// ─── Initial board and state ──────────────────────────────────────────────

function initBoard() {
  const b = {};
  const whiteBack = ['wR','wN','wB','wQ','wK','wB','wN','wR'];
  const blackBack = ['bR','bN','bB','bQ','bK','bB','bN','bR'];
  for (let i = 0; i < 8; i++) {
    const file = String.fromCharCode(97 + i);
    b[`${file}1`] = whiteBack[i];
    b[`${file}2`] = 'wP';
    b[`${file}7`] = 'bP';
    b[`${file}8`] = blackBack[i];
  }
  return b;
}

function initState() {
  return {
    board: initBoard(),
    turn: 'white',
    // castling rights
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,   // square string if available
    status: 'waiting', // waiting, ongoing, checkmate, stalemate
    winner: null
  };
}

// ─── Attack detection ─────────────────────────────────────────────────────

function isSquareAttacked(state, square, byColor) {
  // scan from every enemy piece to see if it could move to 'square' ignoring check
  const board = state.board;
  const dirs = [
    [1,0],[-1,0],[0,1],[0,-1],
    [1,1],[1,-1],[-1,1],[-1,-1]
  ];
  // pawns
  const { col, row } = parsePos(square);
  const pawnDir = byColor==='white' ? -1 : 1;
  for (let dc of [-1,1]) {
    const r = row + pawnDir, c = col + dc;
    if (inBounds(c,r)) {
      const p = board[encodePos(c,r)];
      if (p === (byColor==='white'?'wP':'bP')) return true;
    }
  }
  // knight
  const knightMoves = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  for (let [dc,dr] of knightMoves) {
    const r=row+dr,c=col+dc;
    if (inBounds(c,r) && board[encodePos(c,r)] === `${byColor[0]}N`)
      return true;
  }
  // sliders & king
  for (let i=0;i<dirs.length;i++) {
    const [dc,dr] = dirs[i];
    let steps=1;
    while(true) {
      const c=col+dc*steps, r=row+dr*steps;
      if (!inBounds(c,r)) break;
      const p = board[encodePos(c,r)];
      if (p) {
        const color = p[0]==='w'?'white':'black';
        const type = p[1];
        if (color===byColor) {
          // direct slider
          if (
            (i<4 && (type==='R'||type==='Q')) ||      // orthogonal
            (i>=4 && (type==='B'||type==='Q')) ||    // diagonal
            (steps===1 && type==='K')               // adjacent king
          ) {
            return true;
          }
        }
        break;
      }
      steps++;
    }
  }
  return false;
}

// ─── Move validators ───────────────────────────────────────────────────────

// path clear?
function clearPath(board, from, to) {
  const A=parsePos(from), B=parsePos(to);
  const dc=Math.sign(B.col-A.col), dr=Math.sign(B.row-A.row);
  let c=A.col+dc, r=A.row+dr;
  while(c!==B.col||r!==B.row){
    if(board[encodePos(c,r)])return false;
    c+=dc; r+=dr;
  }
  return true;
}

function validateMove(state, from, to) {
  const b=state.board;
  if (from===to) return false;
  if (!b[from]) return false;
  const color = b[from][0]==='w'?'white':'black';
  if (color!==state.turn) return false;
  const dest=b[to];
  if (dest && (dest[0]===(color==='white'?'w':'b'))) return false;

  const A=parsePos(from), B=parsePos(to);
  const dc=B.col-A.col, dr=B.row-A.row;
  const absC=Math.abs(dc), absR=Math.abs(dr);
  const type=b[from][1];

  // Pawn
  if (type==='P') {
    const dir = color==='white'?1:-1;
    // forward
    if (dc===0) {
      // one step
      if (dr===dir && !dest) ;
      // two step
      else if (
        dr===2*dir && 
        !dest && 
        A.row===(color==='white'?1:6) &&
        !b[encodePos(A.col,A.row+dir)]
      ) ;
      else return false;
    } else if (absC===1 && dr===dir) {
      // capture
      if (dest) ;
      // en passant
      else if (state.enPassant===to) ;
      else return false;
    } else return false;
  }
  // Knight
  else if (type==='N') {
    if (!((absC===1&&absR===2)||(absC===2&&absR===1))) return false;
  }
  // Bishop
  else if (type==='B') {
    if (absC!==absR||!clearPath(b,from,to)) return false;
  }
  // Rook
  else if (type==='R') {
    if (!((dc===0||dr===0)&&clearPath(b,from,to))) return false;
  }
  // Queen
  else if (type==='Q') {
    if (!(((dc===0||dr===0)||(absC===absR))&&clearPath(b,from,to))) return false;
  }
  // King (including castling)
  else if (type==='K') {
    // simple
    if (Math.max(absC,absR)===1) ;
    // castling
    else if (absR===0&&absC===2) {
      const side = dc>0?'K':'Q'; // kingside or queenside
      if (!state.castling[ color[0]+side ]) return false;
      // rook spot
      const rookFile = side==='K'?7:0;
      const rookPos = encodePos(rookFile,A.row);
      if (!b[rookPos]||b[rookPos][1]!=='R') return false;
      // path clear
      const step = dc>0?1:-1;
      if (!clearPath(b,from,encodePos(A.col+step,A.row))) return false;
      if (!clearPath(b,from,encodePos(A.col+2*step,A.row))) return false;
      // no check on f/g squares or current
      const colsToCheck = side==='K'?[4,5,6]:[4,3,2];
      for (let c of colsToCheck) {
        if (isSquareAttacked(state, encodePos(c,A.row), color==='white'?'black':'white'))
          return false;
      }
    } else return false;
  } else return false;

  // simulate and ensure king not left in check
  const sim = {
    ...state,
    board: { ...b },
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: null
  };
  // apply piece
  delete sim.board[from];
  // handle en passant capture
  if (type==='P'&&dc!==0&&!dest) {
    // captured pawn behind
    const capRow = A.row;
    delete sim.board[ encodePos(B.col,capRow) ];
  }
  sim.board[to] = b[from];
  // castling rook move
  if (type==='K'&&absC===2) {
    const step = dc>0?1:-1;
    const rookFrom = encodePos(dc>0?7:0,A.row);
    const rookTo   = encodePos(A.col+step,A.row);
    sim.board[rookTo] = sim.board[rookFrom];
    delete sim.board[rookFrom];
  }
  // cannot leave own king in check
  // find king pos
  let kingSq = null;
  for (let sq in sim.board) {
    if (sim.board[sq]===(color[0]+'K')) kingSq=sq;
  }
  if ( isSquareAttacked(sim, kingSq, color==='white'?'black':'white') )
    return false;

  return true;
}

// ─── Generate all legal moves for stalemate/checkmate detection ───────────

function generateAllMoves(state, forColor) {
  const moves = [];
  for (let from in state.board) {
    if ((state.board[from][0]==='w'? 'white':'black')!==forColor) continue;
    for (let r=0;r<8;r++)for(let c=0;c<8;c++){
      const to=encodePos(c,r);
      if (validateMove(state,from,to)) {
        moves.push([from,to]);
      }
    }
  }
  return moves;
}

// ─── The two public APIs: joinOrCreate & makeMove ──────────────────────────

function joinOrCreate(db, playerId, gameId) {
  return new Promise((resolve,reject)=>{
    if (!gameId) {
      const newId = crypto.randomBytes(3).toString('hex');
      const state = initState();
      db.run(
        `INSERT INTO games (id,player1_id,state) VALUES(?,?,?)`,
        [newId, playerId, JSON.stringify(state)],
        err=>{
          if(err) return reject(err);
          resolve({ gameId:newId, success:true, message:'Created new game' });
        }
      );
    } else {
      db.get(
        `SELECT player1_id,player2_id FROM games WHERE id = ?`,
        [gameId],
        (err,row)=>{
          if(err) return reject(err);
          if(!row) return resolve({ gameId, success:false, message:'Game not found' });
          if(row.player1_id===playerId) {
            return resolve({ gameId, success:true, message:'Re-joined' });
          }
          if(!row.player2_id) {
            db.run(
              `UPDATE games SET player2_id = ? WHERE id = ?`,
              [playerId,gameId],
              err2=>{
                if(err2) return reject(err2);
                resolve({ gameId, success:true, message:'Joined existing game' });
              }
            );
          } else {
            resolve({ gameId, success:false, message:'Game full' });
          }
        }
      );
    }
  });
}

function makeMove(db, playerId, gameId, from, to) {
  return new Promise((resolve,reject)=>{
    db.get(
      `SELECT player1_id,player2_id,state FROM games WHERE id = ?`,
      [gameId],
      (err,row)=>{
        if(err) return reject(err);
        if(!row) return resolve({ success:false, message:'Game not found' });

        const state = JSON.parse(row.state);
        // waiting → ongoing if both present
        if(state.status==='waiting') {
          if(!row.player2_id)
            return resolve({ success:false, message:'Waiting for opponent' });
          state.status='ongoing';
        }
        // whose turn
        const color = playerId===row.player1_id?'white':
                      playerId===row.player2_id?'black':null;
        if(!color) return resolve({ success:false, message:'Not a participant' });
        if(state.turn!==color)
          return resolve({ success:false, message:'Not your turn' });

        // validate
        if(!validateMove(state,from,to))
          return resolve({ success:false, message:'Invalid move' });

        // apply exactly same steps inside validateMove simulation:
        const b = state.board;
        const p = b[from];
        const A = parsePos(from), B=parsePos(to);
        const dc=B.col-A.col, dr=B.row-A.row;
        delete b[from];
        // en passant capture
        if(p[1]==='P'&&dc!==0&&!state.board[to]) {
          delete b[ encodePos(B.col, A.row) ];
        }
        b[to]=p;
        // castling rook
        if(p[1]==='K'&&Math.abs(dc)===2) {
          const step = dc>0?1:-1;
          const rf = encodePos(dc>0?7:0,A.row);
          const rt = encodePos(A.col+step,A.row);
          b[rt]=b[rf];
          delete b[rf];
        }
        // update castling rights
        if(p[1]==='K') state.castling[color[0]+'K']=state.castling[color[0]+'Q']=false;
        if(p[1]==='R') {
          if(from[0]==='a') state.castling[color[0]+'Q']=false;
          if(from[0]==='h') state.castling[color[0]+'K']=false;
        }
        // set en passant target
        state.enPassant=null;
        if(p[1]==='P'&&Math.abs(dr)===2) {
          state.enPassant = encodePos(A.col, A.row + dr/2);
        }
        // promotion auto to queen
        const promoRank = color==='white'?7:0;
        if(p[1]==='P'&&B.row===promoRank) {
          b[to] = color[0]+'Q';
        }

        // switch turn
        state.turn = state.turn==='white'?'black':'white';

        // check status
        const opp = state.turn;
        const kingSq = Object.keys(b).find(s=>b[s]===(opp[0]+'K'));
        const inCheck = isSquareAttacked(state, kingSq, color);
        const moves = generateAllMoves(state, opp);
        if(moves.length===0) {
          if(inCheck) {
            state.status='checkmate';
            state.winner=color;
          } else {
            state.status='stalemate';
            state.winner=null;
          }
        }

        // save
        db.run(
          `UPDATE games SET state = ? WHERE id = ?`,
          [JSON.stringify(state), gameId],
          err2=>{
            if(err2) return reject(err2);
            resolve({ success:true, message:'Move applied' });
          }
        );
      }
    );
  });
}

module.exports = { joinOrCreate, makeMove };