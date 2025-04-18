// server/src/services/gameService.js

const { joinOrCreate, makeMove } = require('../gameLogic');

function initializeGameService(db) {
  return {
    JoinGame: (call, callback) => {
      const { player_id, game_id } = call.request;
      joinOrCreate(db, player_id, game_id)
        .then(({ gameId, success, message }) =>
          callback(null, { game_id: gameId, success, message })
        )
        .catch((err) => callback(err));
    },

    MakeMove: (call, callback) => {
      const { player_id, game_id, from_pos, to_pos } = call.request;
      makeMove(db, player_id, game_id, from_pos, to_pos)
        .then(({ success, message }) =>
          callback(null, { success, message })
        )
        .catch((err) => callback(err));
    },

    // Stub out streaming (we’re using REST + polling on the frontend)
    StreamGameState: (call) => {
      call.end();
    },
  };
}

module.exports = initializeGameService;