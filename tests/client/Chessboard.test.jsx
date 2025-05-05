import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import Chessboard from '../../client/src/components/Chessboard';

// Mock react-konva components
jest.mock('react-konva', () => ({
  Stage: ({ children, ...props }) => <div data-testid="stage" {...props}>{children}</div>,
  Layer: ({ children, ...props }) => <div data-testid="layer" {...props}>{children}</div>,
  Rect: ({ x, y, width, height, fill, ...props }) => 
    <div data-testid="square" data-x={x} data-y={y} data-fill={fill} {...props} />,  
  Image: ({ x, y, width, height, opacity, draggable, ...props }) => 
    <img data-testid="piece" data-x={x} data-y={y} data-opacity={opacity} data-draggable={draggable} {...props} />,  
  Group: ({ children, ...props }) => <div data-testid="group" {...props}>{children}</div>
}));

// Stub helper.validateBasic (unused directly by Chessboard)
jest.mock('../helper', () => ({ validateBasic: jest.fn() }));

describe('Chessboard Component', () => {
  const baseProps = {
    board: {},
    cooldowns: {},
    cfg: { cooldown: 0 },
    onMove: jest.fn(),
    playerColor: 'white'
  };

  it('renders exactly 64 board squares', () => {
    const { getAllByTestId } = render(<Chessboard {...baseProps} />);
    const squares = getAllByTestId('square');
    expect(squares).toHaveLength(64);
    // verify one corner square coords
    expect(squares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ getAttribute: expect.any(Function) })
      ])
    );
  });

  it('renders a piece for each board entry', () => {
    const props = {
      ...baseProps,
      board: { a1: 'wP', h8: 'bR' }
    };
    const { getAllByTestId } = render(<Chessboard {...props} />);
    const pieces = getAllByTestId('piece');
    expect(pieces).toHaveLength(2);
  });

  it('positions pieces correctly for white-bottom orientation', () => {
    const props = {
      ...baseProps,
      board: { a1: 'wP' },
      playerColor: 'white'
    };
    const { getByTestId } = render(<Chessboard {...props} />);
    const piece = getByTestId('piece');
    // a1 -> file 0, rank 0 -> x = 0*50, y = (7-0)*50 = 350
    expect(piece).toHaveAttribute('data-x', '0');
    expect(piece).toHaveAttribute('data-y', '350');
  });

  it('positions pieces correctly for black-bottom orientation', () => {
    const props = {
      ...baseProps,
      board: { a1: 'wP' },
      playerColor: 'black'
    };
    const { getByTestId } = render(<Chessboard {...props} />);
    const piece = getByTestId('piece');
    // black bottom -> flip file: c = 7-file = 7, rank=0 -> r=0 -> y=0
    expect(piece).toHaveAttribute('data-x', '350');
    expect(piece).toHaveAttribute('data-y', '0');
  });

  it('sets draggable only for pieces matching playerColor and off cooldown', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const props = {
      ...baseProps,
      board: { a2: 'wP', b2: 'bN' },
      cooldowns: { a2: 500, b2: 0 },
      cfg: { cooldown: 200 },
      playerColor: 'white'
    };
    const { getAllByTestId } = render(<Chessboard {...props} />);
    const pieces = getAllByTestId('piece');

    // wP at a2: cooldownEnd=500 < now=1000 -> ready -> draggable=true
    expect(pieces[0]).toHaveAttribute('data-draggable', 'true');
    // bN at b2: color != playerColor -> draggable=false
    expect(pieces[1]).toHaveAttribute('data-draggable', 'false');

    nowSpy.mockRestore();
  });

  it('applies full opacity when cooldown has expired', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const props = {
      ...baseProps,
      board: { c3: 'wB' },
      cooldowns: { c3: 500 },
      cfg: { cooldown: 300 },
      playerColor: 'white'
    };
    const { getByTestId } = render(<Chessboard {...props} />);
    const piece = getByTestId('piece');
    // ready: now >= cooldownEnd -> opacity = 1
    expect(piece).toHaveAttribute('data-opacity', '1');
    nowSpy.mockRestore();
  });

  it('applies reduced opacity when still cooling down', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const props = {
      ...baseProps,
      board: { d4: 'wQ' },
      cooldowns: { d4: 2000 },
      cfg: { cooldown: 1000 },
      playerColor: 'white'
    };
    const { getByTestId } = render(<Chessboard {...props} />);
    const piece = getByTestId('piece');
    // not ready: opacity = 0.3
    expect(piece).toHaveAttribute('data-opacity', '0.3');
    nowSpy.mockRestore();
  });
});
