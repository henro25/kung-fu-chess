import React from 'react';

export default function EndScreen({ winner }) {
  return (
    <div className="bg-white p-8 rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold mb-4">Game Over</h1>
      <p className="text-xl">{winner ? `Winner: ${winner}` : 'Stalemate'}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Play Again
      </button>
    </div>
  );
}