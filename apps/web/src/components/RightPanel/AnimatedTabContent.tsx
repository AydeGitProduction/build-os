'use client'
// src/components/RightPanel/AnimatedTabContent.tsx
import React, { useEffect, useRef, useState } from 'react';
import styles from './TabPanel.module.css';
import type { TransitionPhase } from '../../hooks/useTabTransition';

interface AnimatedTabContentProps {
  phase: TransitionPhase;
  children: React.ReactNode;
  className?: string;
}

type CSSPhase = 'idle' | 'exiting' | 'entering' | 'enteringActive';

/**
 * Wraps tab content with phase-aware CSS class transitions.
 *
 * The "entering → enteringActive" split ensures the browser
 * paints the off-screen start position first, then transitions
 * to the visible end position on the next animation frame.
 */
export const AnimatedTabContent: React.FC<AnimatedTabContentProps> = ({
  phase,
  children,
  className,
}) => {
  const [cssPhase, setCssPhase] = useState<CSSPhase>('idle');
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase === 'idle') {
      setCssPhase('idle');
      return;
    }

    if (phase === 'exiting') {
      setCssPhase('exiting');
      return;
    }

    if (phase === 'entering') {
      // Step 1: Apply entering (off-screen, no transition)
      setCssPhase('entering');

      // Step 2: On next animation frame, apply enteringActive (triggers transition)
      rafRef.current = requestAnimationFrame(() => {
        // Double RAF ensures layout has been calculated
        rafRef.current = requestAnimationFrame(() => {
          setCssPhase('enteringActive');
        });
      });

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }
  }, [phase]);

  const phaseClass = {
    idle: styles.idle,
    exiting: styles.exiting,
    entering: styles.entering,
    enteringActive: styles.enteringActive,
  }[cssPhase];

  return (
    <div
      className={[styles.tabContent, phaseClass, className].filter(Boolean).join(' ')}
      aria-hidden={phase === 'exiting' ? true : undefined}
    >
      {children}
    </div>
  );
};