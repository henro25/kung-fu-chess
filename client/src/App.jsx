// client/src/App.jsx

import React, { useState, useEffect } from 'react';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import EndScreen from './components/EndScreen.jsx';
import { getGameState } from './grpc/gameClient';

const App = () => {
  const [screen, setScreen]       = useState('start');
  const [gameId, setGameId]       = useState(null);
  const [playerId]                = useState(Math.random().toString(36).slice(2));
  const [gameState, setGameState] = useState(null);
  const [error, setError]         = useState(null);

  // Poll every 300ms for minimal lag
  useEffect(() => {
    let interval;
    if ((screen === 'waiting' || screen === 'game') && gameId) {
      interval = setInterval(async () => {
        try {
          const state = await getGameState(gameId);
          setGameState(state);
          if (screen === 'waiting' && state.hasOpponent) {
            setScreen('game');
          }
          if (state.status === 'checkmate' || state.status === 'stalemate') {
            setScreen('end');
            clearInterval(interval);
          }
        } catch (e) {
          console.error('Polling error:', e);
          setError(e.message);
          clearInterval(interval);
        }
      }, 300);
    }
    return () => clearInterval(interval);
  }, [screen, gameId]);

  const handleJoin = (newId) => {
    setGameId(newId);
    setScreen('waiting');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>Error: {error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      {screen === 'start' && (
        <StartScreen playerId={playerId} onJoin={handleJoin} />
      )}

      {screen === 'waiting' && (
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-medium">Waiting for another player…</h2>
          <div className="flex justify-center items-center space-x-2">
            <span className="font-medium">Game ID:</span>
            <span className="font-mono text-lg">{gameId}</span>
            <CopyButton text={gameId} />
          </div>
          <div className="text-sm text-gray-600">
            Share this ID with another player to join the game
          </div>
          <button
            onClick={() => setScreen('start')}
            className="mt-4 text-blue-500 hover:underline"
          >
            ← Back
          </button>
        </div>
      )}

      {screen === 'game' && (
        <GameScreen
          gameState={gameState}
          playerId={playerId}
          gameId={gameId}
        />
      )}

      {screen === 'end' && (
        <EndScreen winner={gameState?.winner} />
      )}
    </div>
  );
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 border rounded hover:bg-gray-100"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default App;