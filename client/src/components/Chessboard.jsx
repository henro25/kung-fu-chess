// client/src/components/Chessboard.jsx

import React, { useRef } from 'react';
import { Stage, Layer, Rect, Image } from 'react-konva';

// simple image loader
function useImageSrc(src) {
  const [img, setImg] = React.useState(null);
  React.useEffect(() => {
    const i = new window.Image();
    i.src = src;
    i.onload = () => setImg(i);
  }, [src]);
  return img;
}

export default function Chessboard({
  board,
  cooldowns,
  onMove,
  playerColor,
  turn
}) {
  const size = 50;
  const pieces = Object.entries(board).map(([pos, piece]) => (
    <Piece
      key={pos}
      pos={pos}
      piece={piece}
      size={size}
      cooldowns={cooldowns}
      onMove={onMove}
      playerColor={playerColor}
      turn={turn}
    />
  ));

  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isDark = (r + c) % 2 === 1;
      squares.push(
        <Rect
          key={`sq${r}-${c}`}
          x={c * size}
          y={r * size}
          width={size}
          height={size}
          fill={isDark ? '#769656' : '#eeeed2'}
        />
      );
    }
  }

  return (
    <Stage width={8 * size} height={8 * size}>
      <Layer>{squares}{pieces}</Layer>
    </Stage>
  );
}

function Piece({
  pos,
  piece,
  size,
  cooldowns,
  onMove,
  playerColor,
  turn
}) {
  const img = useImageSrc(`/images/${piece}.png`);
  const ref = useRef();
  const { col, row } = (() => {
    const c = pos.charCodeAt(0) - 97;
    const r = 8 - parseInt(pos[1], 10);
    return playerColor === 'white'
      ? { col: c, row: r }
      : { col: 7 - c, row: 7 - r };
  })();

  const x0 = col * size;
  const y0 = row * size;
  const pieceColor = piece[0] === 'w' ? 'white' : 'black';
  const canDrag =
    img &&
    pieceColor === playerColor &&
    turn === playerColor &&
    (!cooldowns[pos] || cooldowns[pos] < Date.now());

  const handleDragEnd = (e) => {
    const newCol = Math.round(e.target.x() / size);
    const newRow = Math.round(e.target.y() / size);
    const target =
      playerColor === 'white'
        ? String.fromCharCode(97 + newCol) + (8 - newRow)
        : String.fromCharCode(97 + (7 - newCol)) + (newRow + 1);
    onMove(piece, pos, target);
  };

  return (
    <Image
      image={img}
      x={x0}
      y={y0}
      width={size}
      height={size}
      draggable={canDrag}
      onDragEnd={handleDragEnd}
      dragBoundFunc={(p) => ({
        x: Math.max(0, Math.min(p.x, size * 7)),
        y: Math.max(0, Math.min(p.y, size * 7))
      })}
    />
  );
}