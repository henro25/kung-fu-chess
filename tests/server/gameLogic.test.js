const { isValidMove, updateBoard, initialBoard } = require('../../server/src/gameLogic');

describe('Game Logic', () => {
  test('validates legal move', () => {
    const board = { ...initialBoard };
    expect(isValidMove(board, 'wp', 'a2', 'a3', {})).toBe(true);
    expect(isValidMove(board, 'wp', 'a2', 'a5', {})).toBe(false); // Invalid pawn move
  });

  test('updates board correctly', () => {
    const board = { ...initialBoard };
    const newBoard = updateBoard(board, 'a2', 'a3');
    expect(newBoard['a3']).toBe('wp');
    expect(newBoard['a2']).toBeUndefined();
  });
});