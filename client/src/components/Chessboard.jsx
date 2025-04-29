import React, { useEffect, useState } from 'react';
import { Stage, Layer, Rect, Image, Group } from 'react-konva';

// Load image once
function useImageSrc(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    const i = new window.Image();
    i.src = src;
    i.onload = () => setImg(i);
  }, [src]);
  return img;
}

// board-pos → canvas x,y
function toXY(pos, whiteBottom, size = 50) {
  const file = pos.charCodeAt(0) - 97;
  const rank = parseInt(pos[1], 10) - 1;
  const c = whiteBottom ? file : 7 - file;
  const r = whiteBottom ? 7 - rank : rank;
  return { x: c * size, y: r * size };
}

// drop coords → board pos
function encodePos(col, row, whiteBottom) {
  if (whiteBottom) {
    return String.fromCharCode(97 + col) + (8 - row);
  } else {
    return String.fromCharCode(97 + (7 - col)) + (row + 1);
  }
}

export default function Chessboard({
  board,
  cooldowns,
  cfg,
  onMove,
  playerColor
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick(n => n + 1), 100);
    return () => clearInterval(iv);
  }, []);
  const size = 50;
  const whiteBottom = playerColor === 'white';

  // draw the board
  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      squares.push(
        <Rect
          key={`${r}-${c}`}
          x={c * size} y={r * size}
          width={size} height={size}
          fill={(r + c) % 2 ? '#769656' : '#eeeed2'}
        />
      );
    }
  }

  // draw pieces
  const pieces = Object.entries(board).map(([pos, piece]) => (
    <PieceSprite
      key={pos}
      pos={pos}
      piece={piece}
      size={size}
      cooldownEnd={cooldowns[pos] || 0}
      cooldownDuration={cfg.cooldown}
      whiteBottom={whiteBottom}
      onMove={onMove}
      playerColor={playerColor}
    />
  ));

  return (
    <Stage width={8 * size} height={8 * size}>
      <Layer>
        {squares}
        {pieces}
      </Layer>
    </Stage>
  );
}

function PieceSprite({
  pos,
  piece,
  size,
  cooldownEnd,
  cooldownDuration,
  whiteBottom,
  onMove,
  playerColor
}) {
  const img = useImageSrc(`/images/${piece}.png`);
  const { x, y } = toXY(pos, whiteBottom, size);
  const color = piece[0] === 'w' ? 'white' : 'black';

  const now = Date.now();
  const ready = now >= cooldownEnd;
  const rem = Math.max(0, cooldownEnd - now);
  const frac = rem / cooldownDuration;

  // Only pieces of your color and off cooldown are draggable
  const canDrag = img && color === playerColor && ready;

  const opacity = ready ? 1 : 0.3;

  const handleDragEnd = async e => {
    const newC = Math.round(e.target.x() / size);
    const newR = Math.round(e.target.y() / size);
    const to = encodePos(newC, newR, whiteBottom);

    const result = await onMove(piece, pos, to);
    if (!result?.success) {
      // snap back if invalid
      e.target.position({ x, y });
    } else {
      // on success, move to new coords
      e.target.position(toXY(to, whiteBottom, size));
    }
  };

  if (!img) return null;
  return (
    <Group>
      <Image
        image={img}
        x={x} y={y}
        width={size} height={size}
        opacity={opacity}
        draggable={canDrag}
        onDragEnd={handleDragEnd}
        dragBoundFunc={p => ({
          x: Math.max(0, Math.min(p.x, 7 * size)),
          y: Math.max(0, Math.min(p.y, 7 * size))
        })}
      />
      {!ready && (
        <Rect
          x={x}
          y={y + size - 4}
          width={size * (1 - frac)}
          height={4}
          fill="red"
        />
      )}
    </Group>
  );
}
