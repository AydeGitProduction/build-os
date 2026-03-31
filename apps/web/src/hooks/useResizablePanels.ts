// src/hooks/useResizablePanels.ts

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'buildos_wizard_panel_ratio';
const MIN_CHAT_WIDTH = 300;
const MIN_PANEL_WIDTH = 300;
const DEFAULT_RATIO = 0.35; // 35% chat, 65% main panel

interface ResizablePanelsOptions {
  containerRef: React.RefObject<HTMLElement>;
  minLeft?: number;
  minRight?: number;
  storageKey?: string;
  defaultRatio?: number;
}

interface ResizablePanelsResult {
  ratio: number;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  leftStyle: React.CSSProperties;
  rightStyle: React.CSSProperties;
  dividerProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    'data-dragging': boolean;
    role: string;
    'aria-orientation': string;
    'aria-label': string;
    tabIndex: number;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadRatio(storageKey: string, defaultRatio: number): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1) {
        return parsed;
      }
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return defaultRatio;
}

function saveRatio(storageKey: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey, ratio.toString());
  } catch {
    // ignore write errors
  }
}

export function useResizablePanels({
  containerRef,
  minLeft = MIN_CHAT_WIDTH,
  minRight = MIN_PANEL_WIDTH,
  storageKey = STORAGE_KEY,
  defaultRatio = DEFAULT_RATIO,
}: ResizablePanelsOptions): ResizablePanelsResult {
  const [ratio, setRatio] = useState<number>(() =>
    loadRatio(storageKey, defaultRatio)
  );
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    startX: number;
    startRatio: number;
    containerWidth: number;
  } | null>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current || !containerRef.current) return;

      const { startX, startRatio, containerWidth } = dragStateRef.current;
      const deltaX = e.clientX - startX;
      const deltaRatio = deltaX / containerWidth;
      const newRatio = startRatio + deltaRatio;

      // Enforce minimum widths
      const minLeftRatio = minLeft / containerWidth;
      const maxLeftRatio = (containerWidth - minRight) / containerWidth;

      const clampedRatio = clamp(newRatio, minLeftRatio, maxLeftRatio);
      setRatio(clampedRatio);
    },
    [containerRef, minLeft, minRight]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current) return;

      setIsDragging(false);

      // Final ratio save on mouse up
      setRatio((currentRatio) => {
        saveRatio(storageKey, currentRatio);
        return currentRatio;
      });

      dragStateRef.current = null;

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Restore text selection and cursor
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [handleMouseMove, storageKey]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      if (!containerRef.current) return;

      const containerWidth = containerRef.current.getBoundingClientRect().width;

      dragStateRef.current = {
        startX: e.clientX,
        startRatio: ratio,
        containerWidth,
      };

      setIsDragging(true);

      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [containerRef, ratio, handleMouseMove, handleMouseUp]
  );

  // Keyboard accessibility: arrow keys adjust ratio
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const step = 20; // 20px per keypress
      const stepRatio = step / containerWidth;
      const minLeftRatio = minLeft / containerWidth;
      const maxLeftRatio = (containerWidth - minRight) / containerWidth;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setRatio((r) => {
          const next = clamp(r - stepRatio, minLeftRatio, maxLeftRatio);
          saveRatio(storageKey, next);
          return next;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setRatio((r) => {
          const next = clamp(r + stepRatio, minLeftRatio, maxLeftRatio);
          saveRatio(storageKey, next);
          return next;
        });
      }
    },
    [containerRef, minLeft, minRight, storageKey]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [handleMouseMove, handleMouseUp]);

  // Handle window resize: re-clamp ratio
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      if (containerWidth === 0) return;

      const minLeftRatio = minLeft / containerWidth;
      const maxLeftRatio = (containerWidth - minRight) / containerWidth;

      setRatio((r) => clamp(r, minLeftRatio, maxLeftRatio));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [containerRef, minLeft, minRight]);

  const leftStyle: React.CSSProperties = {
    width: `${ratio * 100}%`,
    minWidth: `${minLeft}px`,
    flexShrink: 0,
  };

  const rightStyle: React.CSSProperties = {
    flex: 1,
    minWidth: `${minRight}px`,
    overflow: 'hidden',
  };

  const dividerProps = {
    onMouseDown: handleMouseDown,
    'data-dragging': isDragging,
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-label': 'Resize chat and main panel',
    tabIndex: 0,
    onKeyDown: handleKeyDown,
  };

  return {
    ratio,
    isDragging,
    handleMouseDown,
    leftStyle,
    rightStyle,
    dividerProps,
  };
}