import React, { useState, useEffect } from 'react';
import StartScreen from './components/StartScreen.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import EndScreen from './components/EndScreen.jsx';
import { getGameState, updateLobby, setReady } from './api';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleClick = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleClick}
      className="px-2 py-1 border rounded hover:bg-gray-100 text-sm"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function App() {
  const [screen, setScreen]       = useState('start');
  const [gameId, setGameId]       = useState(null);
  const [playerId]                = useState(Math.random().toString(36).substring(2));
  const [gameState, setGameState] = useState(null);
  const [error, setError]         = useState(null);

  useEffect(() => {
    let interval;
    if (['waiting','lobby','game'].includes(screen) && gameId) {
      interval = setInterval(async () => {
        try {
          const state = await getGameState(gameId);
          setGameState(state);

          if (screen === 'waiting' && state.players.length === 2) {
            setScreen('lobby');
          }
          if (screen === 'lobby' && state.status === 'ongoing') {
            setScreen('game');
          }
          if (state.status === 'ended') {
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

  const handleJoin = newId => {
    setGameId(newId);
    setScreen('waiting');
  };

  const updateLobbySettings = async settings => {
    try {
      await updateLobby(playerId, gameId, settings);
    } catch (e) {
      console.error('Lobby update failed:', e);
      setError(e.message);
    }
  };

  const toggleReady = async ready => {
    try {
      await setReady(playerId, gameId, ready);
    } catch (e) {
      console.error('Set ready failed:', e);
      setError(e.message);
    }
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

  const winnerName =
    gameState?.lobby?.playerSettings?.[gameState.winner]?.name;

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

      {screen === 'lobby' && (
        <LobbyScreen
          gameState={gameState}
          playerId={playerId}
          onUpdateSettings={updateLobbySettings}
          onReadyToggle={toggleReady}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          gameState={gameState}
          playerId={playerId}
          gameId={gameId}
        />
      )}

      {screen === 'end' && (
        <EndScreen winnerName={winnerName} />
      )}
    </div>
  );
}