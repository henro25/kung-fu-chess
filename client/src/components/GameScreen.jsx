import React, { useMemo } from 'react';
import Chessboard from './Chessboard.jsx';
import { makeMove } from '../api';

export default function GameScreen({ gameState, playerId, gameId }) {
  // determine your color: first joiner = white, second = black
  const players = gameState?.players || [];
  const playerColor = useMemo(() => {
    if (players[0] === playerId) return 'white';
    if (players[1] === playerId) return 'black';
    return null;
  }, [players, playerId]);

  // ask server to move; returns { success }
  const handleMove = (piece, from, to) => {
    return makeMove(playerId, gameId, from, to);
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <Chessboard
        board={gameState.board || {}}
        cooldowns={gameState.cooldowns || {}}
        cfg={gameState.cfg}
        onMove={handleMove}
        playerColor={playerColor}
      />
    </div>
  );
}