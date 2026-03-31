// src/components/layout/PanelResizeDivider.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface PanelResizeDividerProps {
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  'aria-label'?: string;
}

export const PanelResizeDivider: React.FC<PanelResizeDividerProps> = ({
  isDragging,
  onMouseDown,
  onKeyDown,
  className,
  'aria-label': ariaLabel = 'Resize panels',
}) => {
  return (
    <div
      className={cn(
        // Layout
        'relative flex items-center justify-center',
        'w-1 flex-shrink-0 self-stretch',
        // Base styling
        'bg-white/5',
        // Transition
        'transition-colors duration-150',
        // Cursor
        'cursor-col-resize',
        // Hover state
        'group',
        // Active/dragging
        isDragging && 'bg-blue-500/30',
        className
      )}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      data-dragging={isDragging}
    >
      {/* Hit area (wider than visual) */}
      <div
        className={cn(
          'absolute inset-y-0 -left-1.5 -right-1.5',
          'cursor-col-resize'
        )}
        aria-hidden="true"
      />

      {/* Visual track */}
      <div
        className={cn(
          'w-px h-full',
          'bg-white/10',
          'group-hover:bg-blue-500/40',
          'transition-colors duration-150',
          isDragging && 'bg-blue-500/60'
        )}
        aria-hidden="true"
      />

      {/* Drag indicator dots */}
      <div
        className={cn(
          'absolute flex flex-col gap-1 items-center',
          'top-1/2 -translate-y-1/2',
          'opacity-0 group-hover:opacity-100',
          'transition-opacity duration-150',
          isDragging && 'opacity-100'
        )}
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              'w-0.5 h-0.5 rounded-full',
              'bg-blue-400/60',
              isDragging && 'bg-blue-400'
            )}
          />
        ))}
      </div>

      {/* Highlight overlay on hover/drag */}
      <div
        className={cn(
          'absolute inset-0',
          'opacity-0',
          'group-hover:opacity-100 group-hover:bg-blue-500/20',
          'transition-opacity duration-150',
          isDragging && 'opacity-100 bg-blue-500/30'
        )}
        aria-hidden="true"
      />
    </div>
  );
};

export default PanelResizeDivider;