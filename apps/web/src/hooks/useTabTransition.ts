// src/hooks/useTabTransition.ts
import { useState, useCallback, useRef } from 'react';

export type TransitionPhase = 'idle' | 'exiting' | 'entering';

export interface TabTransitionState {
  activeTab: string;
  displayTab: string;
  phase: TransitionPhase;
}

export interface UseTabTransitionReturn {
  activeTab: string;
  displayTab: string;
  phase: TransitionPhase;
  switchTab: (newTab: string) => void;
}

const EXIT_DURATION = 100;   // ms — outgoing fade out
const ENTER_DURATION = 150;  // ms — incoming fade in + slide

/**
 * Manages sequential tab transition state:
 * 1. Mark current as "exiting" (fade out, EXIT_DURATION)
 * 2. Swap displayTab
 * 3. Mark new as "entering" (fade in + slide, ENTER_DURATION)
 * 4. Return to "idle"
 */
export function useTabTransition(initialTab: string): UseTabTransitionReturn {
  const [state, setState] = useState<TabTransitionState>({
    activeTab: initialTab,
    displayTab: initialTab,
    phase: 'idle',
  });

  // Guard against stale closures during rapid switching
  const pendingTabRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    exitTimerRef.current = null;
    enterTimerRef.current = null;
  }, []);

  const switchTab = useCallback(
    (newTab: string) => {
      setState((prev) => {
        // No-op if same tab
        if (newTab === prev.activeTab && !isTransitioningRef.current) return prev;
        if (newTab === prev.activeTab) {
          // Queue the target but let current transition resolve
          pendingTabRef.current = null;
          return prev;
        }
        return prev;
      });

      setState((prev) => {
        if (newTab === prev.activeTab) return prev;

        // If already transitioning, fast-forward: cancel timers, jump to new target
        if (isTransitioningRef.current) {
          clearTimers();
          isTransitioningRef.current = false;
          pendingTabRef.current = newTab;
        }

        return prev;
      });

      // Perform the actual transition outside of setState
      performTransition(newTab);
    },
    [clearTimers], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const performTransition = useCallback(
    (newTab: string) => {
      setState((prev) => {
        if (newTab === prev.activeTab && !isTransitioningRef.current) return prev;

        // Interrupt any in-progress transition
        clearTimers();
        isTransitioningRef.current = true;

        // Phase 1: Exit current tab
        const nextState: TabTransitionState = {
          ...prev,
          activeTab: newTab,
          phase: 'exiting',
        };

        // Phase 2: After exit, swap display tab and start enter
        exitTimerRef.current = setTimeout(() => {
          setState((s) => ({
            ...s,
            displayTab: newTab,
            phase: 'entering',
          }));

          // Phase 3: After enter animation completes, go idle
          enterTimerRef.current = setTimeout(() => {
            isTransitioningRef.current = false;
            setState((s) => ({
              ...s,
              phase: 'idle',
            }));

            // Handle any tab switch queued during transition
            const pending = pendingTabRef.current;
            if (pending && pending !== newTab) {
              pendingTabRef.current = null;
              performTransition(pending);
            }
          }, ENTER_DURATION);
        }, EXIT_DURATION);

        return nextState;
      });
    },
    [clearTimers],
  );

  return {
    activeTab: state.activeTab,
    displayTab: state.displayTab,
    phase: state.phase,
    switchTab,
  };
}