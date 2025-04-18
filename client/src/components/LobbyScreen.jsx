import React, { useState, useEffect } from 'react';

export default function LobbyScreen({
  gameState,
  playerId,
  onUpdateSettings,
  onReadyToggle
}) {
  const players = gameState.players || [];
  const lobby   = gameState.lobby   || {
    playerSettings: {},
    ready: {},
    cooldown: gameState.cfg?.cooldown || 2000
  };

  const myIndex      = players.indexOf(playerId);
  const fallbackName = `Player ${myIndex + 1}`;

  const meSettings = lobby.playerSettings[playerId] || {};

  // Local form state for name & cooldown only
  const [name, setName]         = useState('');
  const [cooldown, setCooldown] = useState(lobby.cooldown / 1000);

  // Sync server→form for name
  useEffect(() => {
    const incoming = lobby.playerSettings[playerId] || {};
    if (incoming.name && incoming.name !== name) {
      setName(incoming.name);
    }
  }, [lobby.playerSettings]);

  // Sync server→form for cooldown
  useEffect(() => {
    const secs = lobby.cooldown / 1000;
    if (secs !== cooldown) setCooldown(secs);
  }, [lobby.cooldown]);

  // Push any change back
  useEffect(() => {
    onUpdateSettings({
      name: name.trim() || fallbackName,
      // we no longer send color
      cooldown: cooldown * 1000
    });
  }, [name, cooldown, onUpdateSettings]);

  const ready = !!lobby.ready[playerId];

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Game Lobby</h2>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium">Your Name</label>
          <input
            className="w-full border px-2 py-1"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={fallbackName}
          />
        </div>

        {/* Cooldown */}
        <div>
          <label className="block text-sm font-medium">Cooldown (sec)</label>
          <input
            type="number"
            className="w-full border px-2 py-1"
            min={0.5}
            step={0.5}
            value={cooldown}
            onChange={e => setCooldown(parseFloat(e.target.value))}
          />
        </div>

        {/* Ready */}
        <button
          onClick={() => onReadyToggle(!ready)}
          className={`w-full py-2 rounded ${
            ready ? 'bg-green-500 text-white' : 'bg-gray-200'
          }`}
        >
          {ready ? 'Ready ✓' : 'Mark as Ready'}
        </button>
      </div>

      <hr className="my-4"/>

      <div>
        <h3 className="font-medium mb-2">Players</h3>
        {players.map((pid, idx) => {
          const p = lobby.playerSettings[pid] || {};
          const nameLabel = p.name || `Player ${idx + 1}`;
          return (
            <div key={pid} className="flex justify-between text-sm mb-1">
              <span>{nameLabel}</span>
              <span>
                {lobby.ready[pid] ? '🟢 Ready' : '⚪ Waiting'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}