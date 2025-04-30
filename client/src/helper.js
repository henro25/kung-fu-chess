// client/src/helper.js
export function parsePos(pos) {
    return { c: pos.charCodeAt(0) - 97, r: parseInt(pos[1], 10) - 1 };
  }
  export function encodePos(c, r) {
    return String.fromCharCode(97 + c) + (r + 1);
  }
  export function clearPath(board, from, to) {
    const A = parsePos(from), B = parsePos(to);
    const dc = Math.sign(B.c - A.c), dr = Math.sign(B.r - A.r);
    const steps = Math.max(Math.abs(B.c - A.c), Math.abs(B.r - A.r));
    for (let i = 1; i < steps; i++) {
      const sq = encodePos(A.c + dc * i, A.r + dr * i);
      if (board[sq]) return false;
    }
    return true;
  }
  
export function validateBasic(from, to, state, playerId) {
  const b = state.board;
  const pc = b[from];
  if (!pc) return false;
  const color = pc[0] === 'w' ? 'white' : 'black';
  if (playerId !== state.players[color === 'white' ? 0 : 1]) return false;
  if (b[to] && b[to][0] === pc[0]) return false;

  const A = parsePos(from), B = parsePos(to);
  const dc = B.c - A.c, dr = B.r - A.r;
  const absC = Math.abs(dc), absR = Math.abs(dr);

  switch (pc[1]) {
    case 'P':
      // pawn logic (omitted for brevity) …
      break;
    case 'N':
      if (!((absC===1&&absR===2)||(absC===2&&absR===1))) return false;
      break;
    case 'B':
      if (absC!==absR || !clearPath(b, from, to)) return false;
      break;
    case 'R':
      if (!((dc===0||dr===0) && clearPath(b, from, to))) return false;
      break;
    case 'Q':
      if (!(((dc===0||dr===0)||absC===absR) && clearPath(b,from,to))) return false;
      break;
    case 'K':
      if (Math.max(absC,absR)===1) break;
      return false;
    default:
      return false;
  }
  return true;
}
  