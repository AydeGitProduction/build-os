'use client'
// src/components/layout/WizardLayout.tsx
// (or wherever your three-column layout lives)

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useResizablePanels } from '@/hooks/useResizablePanels';
import { PanelResizeDivider } from '@/components/layout/PanelResizeDivider';

interface WizardLayoutProps {
  /** Column 1: sidebar/nav */
  sidebar: React.ReactNode;
  /** Column 2: chat panel */
  chat: React.ReactNode;
  /** Column 3: main panel */
  mainPanel: React.ReactNode;
  /** Optional sidebar width (fixed) */
  sidebarWidth?: number;
  className?: string;
}

const SIDEBAR_WIDTH = 240; // px, fixed

export const WizardLayout: React.FC<WizardLayoutProps> = ({
  sidebar,
  chat,
  mainPanel,
  sidebarWidth = SIDEBAR_WIDTH,
  className,
}) => {
  // Container ref for width calculation (excludes sidebar)
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
    <div
      className={cn(
        'flex h-screen w-full overflow-hidden bg-gray-950',
        // Disable text selection globally during drag
        isDragging && 'select-none',
        className
      )}
    >
      {/* Column 1: Sidebar (fixed width) */}
      <aside
        className="flex-shrink-0 overflow-hidden border-r border-white/10"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </aside>

      {/* Columns 2 + 3: Resizable area */}
      <div
        ref={resizableContainerRef}
        className="flex flex-1 overflow-hidden"
      >
        {/* Column 2: Chat */}
        <div
          className="flex flex-col overflow-hidden"
          style={leftStyle}
        >
          {chat}
        </div>

        {/* Resize Divider */}
        <PanelResizeDivider
          isDragging={isDragging}
          onMouseDown={dividerProps.onMouseDown}
          onKeyDown={dividerProps.onKeyDown}
          aria-label={dividerProps['aria-label']}
        />

        {/* Column 3: Main Panel */}
        <div
          className="flex flex-col overflow-hidden"
          style={rightStyle}
        >
          {mainPanel}
        </div>
      </div>
    </div>
  );
};

export default WizardLayout;