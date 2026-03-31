// src/hooks/useTabTransition.test.ts
import { renderHook, act } from '@testing-library/react';
import { useTabTransition } from './useTabTransition';

// Mock timers
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTabTransition', () => {
  it('initialises with correct state', () => {
    const { result } = renderHook(() => useTabTransition('preview'));
    expect(result.current.activeTab).toBe('preview');
    expect(result.current.displayTab).toBe('preview');
    expect(result.current.phase).toBe('idle');
  });

  it('transitions through exiting → entering → idle phases', () => {
    const { result } = renderHook(() => useTabTransition('preview'));

    act(() => {
      result.current.switchTab('tasks');
    });

    // Immediately after: should be exiting
    expect(result.current.activeTab).toBe('tasks');
    expect(result.current.displayTab).toBe('preview'); // still showing old
    expect(result.current.phase).toBe('exiting');

    // After exit duration (100ms): should be entering with new tab
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.displayTab).toBe('tasks');
    expect(result.current.phase).toBe('entering');

    // After enter duration (150ms): should be idle
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.activeTab).toBe('tasks');
    expect(result.current.displayTab).toBe('tasks');
    expect(result.current.phase).toBe('idle');
  });

  it('does not transition when switching to current tab', () => {
    const { result } = renderHook(() => useTabTransition('preview'));

    act(() => {
      result.current.switchTab('preview');
    });

    expect(result.current.phase).toBe('idle');
  });

  it('handles rapid tab switching gracefully', () => {
    const { result } = renderHook(() => useTabTransition('preview'));

    act(() => {
      result.current.switchTab('tasks');
    });

    // Switch again mid-animation
    act(() => {
      jest.advanceTimersByTime(50); // halfway through exit
      result.current.switchTab('blueprint');
    });

    // Should end up at blueprint
    act(() => {
      jest.advanceTimersByTime(300); // enough time for full transition
    });

    expect(result.current.activeTab).toBe('blueprint');
    expect(result.current.displayTab).toBe('blueprint');
    expect(result.current.phase).toBe('idle');
  });

  it('total transition duration is ~250ms (100 exit + 150 enter)', () => {
    const { result } = renderHook(() => useTabTransition('preview'));

    act(() => {
      result.current.switchTab('tasks');
    });

    // At 249ms: still not idle
    act(() => {
      jest.advanceTimersByTime(249);
    });
    expect(result.current.phase).not.toBe('idle');

    // At 250ms: now idle
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.phase).toBe('idle');
  });
});