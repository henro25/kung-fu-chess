import React from 'react';

export default function EndScreen({ winnerName }) {
  return (
    <div className="bg-white p-8 rounded-lg shadow-lg text-center">
      <h1 className="text-3xl font-bold mb-4">Game Over</h1>
      <p className="text-xl mb-6">
        {winnerName ? `Winner: ${winnerName}` : 'Stalemate'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mx-auto block"
      >
        Main Menu
      </button>
    </div>
  );
}