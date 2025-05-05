const { validateBasic, makeMove, joinOrCreate, updateLobby, setReady, tick,
  applyCreateOrJoin } = require('../../server/src/gameLogic');
const sqlite3 = require('sqlite3').verbose();

describe('validateBasic', () => {
  let st;

  beforeEach(() => {
    st = {
      board: {},
      enPassant: null,
      cooldowns: {},
      castlingRights: {
        whiteKing: true, whiteQueen: true,
        blackKing: true, blackQueen: true
      }
    };
  });

  describe('Pawn Moves', () => {
    test('allows white pawn single-step forward', () => {
      st.board['a2'] = 'wP';
      expect(validateBasic('a2', 'a3', st, 'white')).toBe(true);
    });

    test('allows white pawn double-step from rank 2 when path clear', () => {
      st.board['b2'] = 'wP';
      // b3 and b4 empty
      expect(validateBasic('b2', 'b4', st, 'white')).toBe(true);
    });

    test('blocks white pawn double-step when path obstructed', () => {
      st.board['c2'] = 'wP';
      st.board['c3'] = 'bP';
      expect(validateBasic('c2', 'c4', st, 'white')).toBe(false);
    });

    test('allows white pawn diagonal capture', () => {
      st.board['d4'] = 'wP';
      st.board['e5'] = 'bP';
      expect(validateBasic('d4', 'e5', st, 'white')).toBe(true);
    });

    test('blocks white pawn diagonal move without capture', () => {
      st.board['d4'] = 'wP';
      expect(validateBasic('d4', 'e5', st, 'white')).toBe(false);
    });

    test('allows en passant capture', () => {
      st.board['a5'] = 'wP';
      st.enPassant = 'b6';
      expect(validateBasic('a5', 'b6', st, 'white')).toBe(true);
    });

    test('allows black pawn single-step forward', () => {
      st.board['h7'] = 'bP';
      expect(validateBasic('h7', 'h6', st, 'black')).toBe(true);
    });

    test('allows black pawn double-step from rank 7 when clear', () => {
      st.board['g7'] = 'bP';
      expect(validateBasic('g7', 'g5', st, 'black')).toBe(true);
    });

    test('blocks black pawn diagonal capture', () => {
      st.board['e5'] = 'bP';
      st.board['d4'] = 'wP';
      expect(validateBasic('e5', 'd4', st, 'black')).toBe(true);
    });

    test('blocks pawn backward move', () => {
      st.board['f4'] = 'wP';
      expect(validateBasic('f4', 'f3', st, 'white')).toBe(false);
    });

    test('blocks pawn horizontal move', () => {
      st.board['f4'] = 'wP';
      expect(validateBasic('f4', 'g4', st, 'white')).toBe(false);
    });
  });

  describe('Knight Moves', () => {
    beforeEach(() => { st.board['b1'] = 'wN'; });

    test('allows L-shaped move', () => {
      expect(validateBasic('b1', 'c3', st, 'white')).toBe(true);
      expect(validateBasic('b1', 'a3', st, 'white')).toBe(true);
    });

    test('blocks non-L-shaped move', () => {
      expect(validateBasic('b1', 'b3', st, 'white')).toBe(false);
    });
  });

  describe('Sliding Pieces', () => {
    test('bishop moves along diagonal when path clear', () => {
      st.board['c1'] = 'wB';
      expect(validateBasic('c1', 'f4', st, 'white')).toBe(true);
    });

    test('bishop blocked by piece', () => {
      st.board['c1'] = 'wB';
      st.board['d2'] = 'wP';
      expect(validateBasic('c1', 'f4', st, 'white')).toBe(false);
    });

    test('rook moves along file when clear', () => {
      st.board['a1'] = 'wR';
      expect(validateBasic('a1', 'a4', st, 'white')).toBe(true);
    });

    test('rook blocked by piece', () => {
      st.board['a1'] = 'wR';
      st.board['a2'] = 'bP';
      expect(validateBasic('a1', 'a4', st, 'white')).toBe(false);
    });

    test('queen moves straight and diagonal when clear', () => {
      st.board['d1'] = 'wQ';
      expect(validateBasic('d1', 'd5', st, 'white')).toBe(true);
      expect(validateBasic('d1', 'g4', st, 'white')).toBe(true);
    });

    test('queen blocked by piece', () => {
      st.board['d1'] = 'wQ';
      st.board['d3'] = 'wP';
      expect(validateBasic('d1', 'd5', st, 'white')).toBe(false);
    });
  });

  describe('King Moves', () => {
    test('allows single-step moves', () => {
      st.board['e1'] = 'wK';
      expect(validateBasic('e1', 'e2', st, 'white')).toBe(true);
      expect(validateBasic('e1', 'd1', st, 'white')).toBe(true);
    });

    test('blocks long moves', () => {
      st.board['e1'] = 'wK';
      expect(validateBasic('e1', 'e3', st, 'white')).toBe(false);
    });

    test('allows kingside castling when rights and path clear', () => {
      st.board['e1'] = 'wK';
      st.board['h1'] = 'wR';
      // f1, g1 empty
      expect(validateBasic('e1', 'g1', st, 'white')).toBe(true);
    });

    test('allows queenside castling when rights and path clear', () => {
      st.board['e1'] = 'wK';
      st.board['a1'] = 'wR';
      // b1, c1, d1 empty
      expect(validateBasic('e1', 'c1', st, 'white')).toBe(true);
    });

    test('blocks castling without rights', () => {
      st.board['e1'] = 'wK';
      st.board['h1'] = 'wR';
      st.castlingRights.whiteKing = false;
      expect(validateBasic('e1', 'g1', st, 'white')).toBe(false);
    });

    test('blocks castling when path obstructed', () => {
      st.board['e1'] = 'wK';
      st.board['h1'] = 'wR';
      st.board['f1'] = 'bN';
      expect(validateBasic('e1', 'g1', st, 'white')).toBe(false);
    });
  });

  describe('Miscellaneous Rules', () => {
    test('blocks moves when source cooldown active', () => {
      st.board['a2'] = 'wP';
      st.cooldowns['a2'] = Date.now() + 100000;
      expect(validateBasic('a2', 'a3', st, 'white')).toBe(false);
    });

    test('blocks moving from empty square', () => {
      expect(validateBasic('a3', 'a4', st, 'white')).toBe(false);
    });

    test('blocks capturing own piece', () => {
      st.board['a2'] = 'wP';
      st.board['a3'] = 'wP';
      expect(validateBasic('a2', 'a3', st, 'white')).toBe(false);
    });
  });
});

describe('makeMove – state mutations', () => {
  let db;
  const gameId = 'game123';
  const player1 = 'player1';

  // Helper: create in-memory DB and games table
  beforeEach(done => {
    db = new sqlite3.Database(':memory:');
    db.run(
      `CREATE TABLE games (id TEXT PRIMARY KEY, player1_id TEXT, player2_id TEXT, state TEXT)`,
      err => err ? done(err) : done()
    );
  });

  afterEach(() => {
    db.close();
  });

  // Helper: insert a game row with given state
  function insertState(state) {
    return new Promise((res, rej) => {
      db.run(
        `INSERT INTO games (id, player1_id, state) VALUES (?,?,?)`,
        [gameId, player1, JSON.stringify(state)],
        err => err ? rej(err) : res()
      );
    });
  }

  // Helper: fetch current state from DB
  function getState() {
    return new Promise((res, rej) => {
      db.get(
        `SELECT state FROM games WHERE id=?`,
        [gameId],
        (err, row) => err ? rej(err) : res(JSON.parse(row.state))
      );
    });
  }

  test('simple pawn move updates board and cooldown', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
    const initialState = {
      board: { a2: 'wP' },
      enPassant: null,
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 500 },
      status: 'ongoing'
    };
    await insertState(initialState);

    const result = await makeMove(db, player1, gameId, 'a2', 'a3');
    expect(result).toEqual({ success: true });

    const st = await getState();
    expect(st.board.a3).toBe('wP');
    expect(st.board.a2).toBeUndefined();
    expect(st.cooldowns.a3).toBe(1000000 + 500);

    Date.now.mockRestore();
  });

  test('pawn double-step sets enPassant target', async () => {
    const initialState = {
      board: { a2: 'wP' },
      enPassant: null,
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 0 },
      status: 'ongoing'
    };
    await insertState(initialState);

    await makeMove(db, player1, gameId, 'a2', 'a4');
    const st = await getState();
    expect(st.enPassant).toBe('a3');
  });

  test('pawn promotion to queen', async () => {
    const initialState = {
      board: { a7: 'wP' },
      enPassant: null,
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 0 },
      status: 'ongoing'
    };
    await insertState(initialState);

    await makeMove(db, player1, gameId, 'a7', 'a8');
    const st = await getState();
    expect(st.board.a8).toBe('wQ');
  });

  test('captures opponent piece', async () => {
    const initialState = {
      board: { d5: 'wN', e7: 'bP' },
      enPassant: null,
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 0 },
      status: 'ongoing'
    };
    await insertState(initialState);

    await makeMove(db, player1, gameId, 'd5', 'e7');
    const st = await getState();
    expect(st.board.e7).toBe('wN');
    expect(st.board.d5).toBeUndefined();
  });

  test('castling moves king and rook correctly', async () => {
    const initialState = {
      board: { e1: 'wK', h1: 'wR' },
      enPassant: null,
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 0 },
      status: 'ongoing'
    };
    await insertState(initialState);

    await makeMove(db, player1, gameId, 'e1', 'g1');
    const st = await getState();
    expect(st.board.g1).toBe('wK');
    expect(st.board.f1).toBe('wR');
  });

  test('capturing king ends the game and sets winner', async () => {
    const initialState = {
      board: { d4: 'wN', e5: 'bK' },
      enPassant: null,
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 0 },
      status: 'ongoing'
    };
    await insertState(initialState);

    await makeMove(db, player1, gameId, 'd4', 'e5');
    const st = await getState();
    expect(st.status).toBe('ended');
    expect(st.winner).toBe(player1);
  });

  test('en passant capture removes the captured pawn', async () => {
    const initialState = {
      board: { a5: 'wP', b5: 'bP' },
      enPassant: 'b6',
      cooldowns: {},
      castlingRights: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
      cfg: { cooldown: 0 },
      status: 'ongoing'
    };
    await insertState(initialState);

    await makeMove(db, player1, gameId, 'a5', 'b6');
    const st = await getState();
    expect(st.board.b6).toBe('wP');
    // captured pawn on b5 is removed
    expect(st.board.b5).toBeUndefined();
  });
});
