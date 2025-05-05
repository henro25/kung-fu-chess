const { joinGame, makeMove, streamGameState } = require('../../client/src/grpc/gameClient');

describe('Game Flow Integration', () => {
  test('two players can join and play', async () => {
    const player1 = 'player1';
    const player2 = 'player2';
    let gameId;

    // Player 1 joins
    const join1 = await joinGame(player1, '');
    expect(join1.success).toBe(true);
    gameId = join1.game_id;

    // Player 2 joins
    const join2 = await joinGame(player2, gameId);
    expect(join2.success).toBe(true);

    // Stream game state
    let gameState;
    streamGameState(gameId, (state) => {
      gameState = state;
    });

    // Wait for game to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(gameState.status).toBe('ongoing');

    // Make a move
    const move = await makeMove(player1, gameId, 'wp', 'a2', 'a3');
    expect(move.success).toBe(true);
  });
});

describe('Game Flow Integration – additional scenarios', () => {
  const { joinGame, makeMove, streamGameState } = require('../../client/src/grpc/gameClient');
  let gameId, player1, player2;

  beforeAll(async () => {
    player1 = 'alice';
    player2 = 'bob';
    const join1 = await joinGame(player1, '');
    gameId = join1.gameId;
    await joinGame(player2, gameId);
  });

  test('rejects illegal move attempts', async () => {
    // white pawn on a2 cannot jump to a5
    await expect(makeMove(player1, gameId, 'a2', 'a5')).rejects.toThrow();
  });

  test('does not allow a third player to join the same game', async () => {
    const player3 = 'charlie';
    await expect(joinGame(player3, gameId)).rejects.toThrow();
  });
});
