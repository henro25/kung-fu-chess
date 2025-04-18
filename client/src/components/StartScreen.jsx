// client/src/components/StartScreen.jsx

import React, { useState } from 'react';
import { joinGame } from '../grpc/gameClient';

export default function StartScreen({ playerId, onJoin }) {
  const [gameIdInput, setGameIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createGame = async () => {
    setError(null);
    setLoading(true);
    try {
      const { game_id, success, message } = await joinGame(playerId, '');
      if (!success) throw new Error(message);
      onJoin(game_id);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const joinExisting = async () => {
    if (!gameIdInput.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { game_id, success, message } = await joinGame(
        playerId,
        gameIdInput.trim()
      );
      if (!success) throw new Error(message);
      onJoin(game_id);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center px-4">
      <div className="bg-white bg-opacity-80 backdrop-blur-lg rounded-2xl shadow-xl p-8 max-w-sm w-full">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">
          Kung Fu Chess
        </h1>

        {error && (
          <div className="mb-4 text-center text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col space-y-4">
          <button
            onClick={createGame}
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium rounded-lg transition"
          >
            {loading ? 'Creating…' : 'Create New Game'}
          </button>

          <div className="text-center text-gray-500 uppercase tracking-wider">
            or
          </div>

          <input
            type="text"
            placeholder="Enter Game ID"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            disabled={loading}
            className="w-full py-2 px-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
          />

          <button
            onClick={joinExisting}
            disabled={loading || !gameIdInput.trim()}
            className="w-full py-3 bg-white border border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-medium rounded-lg transition"
          >
            {loading ? 'Joining…' : 'Join Game'}
          </button>
        </div>
      </div>
    </div>
  );
}