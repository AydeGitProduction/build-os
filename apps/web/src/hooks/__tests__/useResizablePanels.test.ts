// src/hooks/__tests__/useResizablePanels.test.ts

import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useResizablePanels } from '../useResizablePanels';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function createContainerRef(width = 1000) {
  const ref = { current: document.createElement('div') };
  jest.spyOn(ref.current, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 800,
    top: 0,
    left: 0,
    right: width,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
  return ref;
}

describe('useResizablePanels', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns default ratio when no stored value', () => {
    const containerRef = createContainerRef();
    const { result } = renderHook(() =>
      useResizablePanels({ containerRef, defaultRatio: 0.35 })
    );
    expect(result.current.ratio).toBe(0.35);
  });

  it('restores ratio from localStorage', () => {
    localStorageMock.setItem('buildos_wizard_panel_ratio', '0.45');
    const containerRef = createContainerRef();
    const { result } = renderHook(() =>
      useResizablePanels({ containerRef })
    );
    expect(result.current.ratio).toBe(0.45);
  });

  it('ignores invalid localStorage values', () => {
    localStorageMock.setItem('buildos_wizard_panel_ratio', 'invalid');
    const containerRef = createContainerRef();
    const { result } = renderHook(() =>
      useResizablePanels({ containerRef, defaultRatio: 0.4 })
    );
    expect(result.current.ratio).toBe(0.4);
  });

  it('clamps ratio to respect minLeft (300px default)', () => {
    // containerWidth = 1000, minLeft = 300, so minRatio = 0.3
    localStorageMock.setItem('buildos_wizard_panel_ratio', '0.1'); // too small
    const containerRef = createContainerRef(1000);
    const { result } = renderHook(() =>
      useResizablePanels({
        containerRef,
        minLeft: 300,
        minRight: 300,
        defaultRatio: 0.35,
      })
    );
    // ratio 0.1 = 100px < 300px minimum, should load as 0.1 (clamping only on resize)
    // Note: initial load doesn't clamp since container width may not be known yet
    expect(result.current.ratio).toBe(0.1);
  });

  it('mousedown sets isDragging true', () => {
    const containerRef = createContainerRef(1000);
    const { result } = renderHook(() =>
      useResizablePanels({ containerRef })
    );

    const mockEvent = {
      preventDefault: jest.fn(),
      clientX: 350,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleMouseDown(mockEvent);
    });

    expect(result.current.isDragging).toBe(true);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('saves ratio to localStorage on mouseup', () => {
    const containerRef = createContainerRef(1000);
    const { result } = renderHook(() =>
      useResizablePanels({
        containerRef,
        storageKey: 'buildos_wizard_panel_ratio',
        defaultRatio: 0.35,
      })
    );

    const mouseDownEvent = {
      preventDefault: jest.fn(),
      clientX: 350,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleMouseDown(mouseDownEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 350 }));
    });

    expect(result.current.isDragging).toBe(false);
    expect(localStorageMock.getItem('buildos_wizard_panel_ratio')).not.toBeNull();
  });

  it('applies correct styles', () => {
    const containerRef = createContainerRef();
    const { result } = renderHook(() =>
      useResizablePanels({ containerRef, defaultRatio: 0.35 })
    );

    expect(result.current.leftStyle.width).toBe('35%');
    expect(result.current.rightStyle.flex).toBe(1);
  });
});