// client/src/components/GameScreen.jsx

import React, { useState, useEffect, useRef } from 'react';
import Chessboard from './Chessboard.jsx';
import { makeMove } from '../grpc/gameClient';

export default function GameScreen({ gameState, playerId, gameId }) {
  const [localBoard, setLocalBoard] = useState({});
  const [cooldowns, setCooldowns]   = useState({});
  const [turn, setTurn]             = useState(null);
  const prevBoardRef = useRef({});

  // Sync incoming board
  useEffect(() => {
    if (gameState && typeof gameState.board === 'object') {
      setLocalBoard(gameState.board);
      prevBoardRef.current = gameState.board;
    }
    setCooldowns(gameState?.cooldowns || {});
    setTurn(gameState?.turn);
  }, [gameState]);

  const handleMove = async (piece, from, to) => {
    const oldBoard = { ...localBoard };

    // Optimistically apply
    const newBoard = { ...oldBoard, [to]: piece };
    delete newBoard[from];
    setLocalBoard(newBoard);

    try {
      const { success, message } = await makeMove(
        playerId,
        gameId,    // ← use the real gameId
        piece,
        from,
        to
      );
      if (!success) throw new Error(message);
    } catch (err) {
      console.warn('Move rejected:', err.message);
      // Snap back on invalid
      setLocalBoard(oldBoard);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <Chessboard
        board={localBoard}
        cooldowns={cooldowns}
        onMove={handleMove}
        playerColor={playerId === gameState.player1Id ? 'white' : 'black'}
        turn={turn}
      />
    </div>
  );
}