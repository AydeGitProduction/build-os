// src/components/BuildOSWizard.tsx (modified sections)

import React, { useRef } from 'react';
import { useResizablePanels } from '@/hooks/useResizablePanels';
import { PanelResizeDivider } from '@/components/layout/PanelResizeDivider';
import { cn } from '@/lib/utils';

// --- Inside your existing component ---

export function BuildOSWizard() {
  // ... existing state

  const resizableContainerRef = useRef<HTMLDivElement>(null);

  const { isDragging, leftStyle, rightStyle, dividerProps } =
    useResizablePanels({
      containerRef: resizableContainerRef,
      minLeft: 300,
      minRight: 300,
      storageKey: 'buildos_wizard_panel_ratio',
      defaultRatio: 0.35,
    });

  return (
    <div className={cn('flex h-screen w-full overflow-hidden', isDragging && 'select-none')}>

      {/* === SIDEBAR (Column 1, unchanged) === */}
      <aside className="w-[240px] flex-shrink-0 border-r border-white/10">
        {/* ... sidebar content ... */}
      </aside>

      {/* === RESIZABLE AREA === */}
      <div ref={resizableContainerRef} className="flex flex-1 overflow-hidden">

        {/* === CHAT (Column 2) === */}
        <div className="flex flex-col overflow-hidden" style={leftStyle}>
          {/* ... chat content ... */}
        </div>

        {/* === RESIZE HANDLE === */}
        <PanelResizeDivider
          isDragging={isDragging}
          onMouseDown={dividerProps.onMouseDown}
          onKeyDown={dividerProps.onKeyDown}
        />

        {/* === MAIN PANEL (Column 3) === */}
        <div className="flex flex-col overflow-hidden" style={rightStyle}>
          {/* ... main panel content ... */}
        </div>

      </div>
    </div>
  );
}