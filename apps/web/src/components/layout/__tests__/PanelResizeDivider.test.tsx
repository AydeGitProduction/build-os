// src/components/layout/__tests__/PanelResizeDivider.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelResizeDivider } from '../PanelResizeDivider';

describe('PanelResizeDivider', () => {
  it('renders with correct ARIA attributes', () => {
    const mockMouseDown = jest.fn();
    render(
      <PanelResizeDivider
        isDragging={false}
        onMouseDown={mockMouseDown}
        aria-label="Resize chat and main panel"
      />
    );

    const divider = screen.getByRole('separator');
    expect(divider).toBeInTheDocument();
    expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    expect(divider).toHaveAttribute('aria-label', 'Resize chat and main panel');
    expect(divider).toHaveAttribute('tabindex', '0');
  });

  it('calls onMouseDown when clicked', () => {
    const mockMouseDown = jest.fn();
    render(
      <PanelResizeDivider isDragging={false} onMouseDown={mockMouseDown} />
    );

    const divider = screen.getByRole('separator');
    fireEvent.mouseDown(divider);
    expect(mockMouseDown).toHaveBeenCalledTimes(1);
  });

  it('applies dragging state via data attribute', () => {
    const mockMouseDown = jest.fn();
    const { rerender } = render(
      <PanelResizeDivider isDragging={false} onMouseDown={mockMouseDown} />
    );

    const divider = screen.getByRole('separator');
    expect(divider).toHaveAttribute('data-dragging', 'false');

    rerender(
      <PanelResizeDivider isDragging={true} onMouseDown={mockMouseDown} />
    );
    expect(divider).toHaveAttribute('data-dragging', 'true');
  });

  it('calls onKeyDown for arrow keys', () => {
    const mockMouseDown = jest.fn();
    const mockKeyDown = jest.fn();
    render(
      <PanelResizeDivider
        isDragging={false}
        onMouseDown={mockMouseDown}
        onKeyDown={mockKeyDown}
      />
    );

    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(mockKeyDown).toHaveBeenCalledTimes(2);
  });
});