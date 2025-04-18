import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import Chessboard from '../../client/src/components/Chessboard';

describe('Chessboard Component', () => {
  const mockBoard = {
    'a2': 'wp',
    'e8': 'bk',
  };
  const mockCooldowns = {};
  const mockOnSquareClick = jest.fn();

  test('renders 8x8 grid', () => {
    const { container } = render(
      <Chessboard
        board={mockBoard}
        cooldowns={mockCooldowns}
        onSquareClick={mockOnSquareClick}
      />
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(64); // 8x8 grid
  });

  test('displays pieces correctly', () => {
    const { getByText } = render(
      <Chessboard
        board={mockBoard}
        cooldowns={mockCooldowns}
        onSquareClick={mockOnSquareClick}
      />
    );
    expect(getByText('wp')).toBeInTheDocument();
    expect(getByText('bk')).toBeInTheDocument();
  });

  test('calls onSquareClick when a square is clicked', () => {
    const { container } = render(
      <Chessboard
        board={mockBoard}
        cooldowns={mockCooldowns}
        onSquareClick={mockOnSquareClick}
      />
    );
    const square = container.querySelector('rect');
    fireEvent.click(square);
    expect(mockOnSquareClick).toHaveBeenCalledWith(expect.any(String));
  });

  test('does not call onSquareClick for cooled-down piece', () => {
    const cooledDown = { 'a2': Date.now() + 10000 };
    render(
      <Chessboard
        board={mockBoard}
        cooldowns={cooledDown}
        onSquareClick={mockOnSquareClick}
      />
    );
    const piece = document.querySelector('text[text="wp"]');
    fireEvent.click(piece);
    expect(mockOnSquareClick).not.toHaveBeenCalled();
  });
});