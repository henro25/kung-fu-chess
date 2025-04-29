import React, { useState, useEffect, useCallback, useRef } from 'react';
import debounce from 'lodash.debounce';

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

  // Local state
  const [name, setName] = useState(lobby.playerSettings[playerId]?.name || fallbackName);
  const [cooldown, setCooldown] = useState(lobby.cooldown / 1000);
  const editing = useRef(false);

  // Mirror server name → local when not editing
  useEffect(() => {
    if (!editing.current) {
      const incoming = lobby.playerSettings[playerId]?.name || fallbackName;
      if (incoming !== name) {
        setName(incoming);
      }
    }
  }, [lobby.playerSettings[playerId]?.name, fallbackName, name]);

  // Mirror server cooldown → local
  useEffect(() => {
    const secs = lobby.cooldown / 1000;
    if (!editing.current && secs !== cooldown) {
      setCooldown(secs);
    }
  }, [lobby.cooldown, cooldown]);

  // Debounced update to server for every keystroke
  const debouncedUpdate = useCallback(
    debounce((newName, newCd) => {
      onUpdateSettings({ name: newName.trim(), cooldown: newCd * 1000 });
    }, 300),
    [onUpdateSettings]
  );

  // Handlers
  const handleNameChange = e => {
    const v = e.target.value;
    setName(v);
    debouncedUpdate(v, cooldown);
  };

  const handleCooldownChange = e => {
    const v = parseFloat(e.target.value) || 0;
    setCooldown(v);
    debouncedUpdate(name, v);
  };

  const handleBlur = () => {
    editing.current = false;
    onUpdateSettings({ name: name.trim(), cooldown: cooldown * 1000 });
  };

  const handleFocus = () => {
    editing.current = true;
  };

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
            placeholder={fallbackName}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleNameChange}
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
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleCooldownChange}
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
