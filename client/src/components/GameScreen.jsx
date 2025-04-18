import React from 'react';
import Chessboard from './Chessboard.jsx';
import { makeMove } from '../api';

export default function GameScreen({ gameState, playerId, gameId }) {
  const { players, lobby } = gameState;
  const settings = lobby.playerSettings || {};

  // Figure out which playerId is white vs black
  const whitePlayerId = players.find(pid => settings[pid]?.color === 'white') ?? players[0];
  const blackPlayerId = players.find(pid => settings[pid]?.color === 'black') ?? players[1];

  const whiteName = settings[whitePlayerId]?.name || 'White';
  const blackName = settings[blackPlayerId]?.name || 'Black';

  // Derive our color
  const playerColor = playerId === whitePlayerId ? 'white' : 'black';

  // Send move to server
  const handleMove = (piece, from, to) =>
    makeMove(playerId, gameId, from, to);

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      {/* Who’s who */}
      <div className="flex justify-between mb-4 text-lg font-medium">
        <span className="text-gray-700">White: {whiteName}</span>
        <span className="text-gray-700">Black: {blackName}</span>
      </div>

      <Chessboard
        board={gameState.board}
        cooldowns={gameState.cooldowns}
        cfg={gameState.cfg}
        onMove={handleMove}
        playerColor={playerColor}
      />
    </div>
  );
}