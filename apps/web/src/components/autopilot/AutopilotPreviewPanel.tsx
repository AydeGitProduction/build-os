'use client'
// src/components/autopilot/AutopilotPreviewPanel.tsx

import React, { useState, useCallback } from "react";
import {
  Eye,
  ListTodo,
  FileText,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewTab } from "./tabs/PreviewTab";
import { TasksTab } from "./tabs/TasksTab";
import { BlueprintTab } from "./tabs/BlueprintTab";
import { LogsTab } from "./tabs/LogsTab";

// ─── Tab Definitions ────────────────────────────────────────────────────────

export type TabId = "preview" | "tasks" | "blueprint" | "logs";

interface TabDefinition {
  id: TabId;
  label: string;
  Icon: React.FC<{ className?: string }>;
}

const TABS: TabDefinition[] = [
  { id: "preview",   label: "Preview",   Icon: Eye      },
  { id: "tasks",     label: "Tasks",     Icon: ListTodo },
  { id: "blueprint", label: "Blueprint", Icon: FileText },
  { id: "logs",      label: "Logs",      Icon: Terminal },
];

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AutopilotPreviewPanelProps {
  /** ID of the currently selected phase, forwarded to TasksTab */
  selectedPhaseId?: string | null;
  /** Additional class names for the root element */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const AutopilotPreviewPanel: React.FC<AutopilotPreviewPanelProps> = ({
  selectedPhaseId = null,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("preview");

  const handleTabClick = useCallback((id: TabId) => {
    setActiveTab(id);
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden",
        className
      )}
    >
      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabClick={handleTabClick}
      />

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <TabContent activeTab={activeTab} selectedPhaseId={selectedPhaseId} />
      </div>
    </div>
  );
};

// ─── TabBar ──────────────────────────────────────────────────────────────────

interface TabBarProps {
  tabs: TabDefinition[];
  activeTab: TabId;
  onTabClick: (id: TabId) => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabClick }) => (
  <div
    role="tablist"
    aria-label="Autopilot panel sections"
    className="flex items-end gap-0 border-b border-border bg-muted/30 px-2 pt-2 shrink-0"
  >
    {tabs.map(({ id, label, Icon }) => {
      const isActive = id === activeTab;
      return (
        <button
          key={id}
          role="tab"
          aria-selected={isActive}
          aria-controls={`tabpanel-${id}`}
          id={`tab-${id}`}
          onClick={() => onTabClick(id)}
          className={cn(
            // base
            "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium",
            "rounded-t-md select-none transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            // inactive
            "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            // active overrides
            isActive && [
              "text-foreground bg-background",
              "border border-b-0 border-border",
              // pull down 1px to sit flush on the border-b of the container
              "translate-y-px",
            ]
          )}
        >
          <Icon
            className={cn(
              "w-4 h-4 shrink-0 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span>{label}</span>

          {/* Active underline accent */}
          {isActive && (
            <span
              aria-hidden
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full translate-y-0.5"
            />
          )}
        </button>
      );
    })}
  </div>
);

// ─── TabContent ──────────────────────────────────────────────────────────────

interface TabContentProps {
  activeTab: TabId;
  selectedPhaseId: string | null;
}

const TabContent: React.FC<TabContentProps> = ({ activeTab, selectedPhaseId }) => (
  <>
    <TabPanel id="preview" activeTab={activeTab}>
      <PreviewTab />
    </TabPanel>

    <TabPanel id="tasks" activeTab={activeTab}>
      <TasksTab selectedPhaseId={selectedPhaseId} />
    </TabPanel>

    <TabPanel id="blueprint" activeTab={activeTab}>
      <BlueprintTab />
    </TabPanel>

    <TabPanel id="logs" activeTab={activeTab}>
      <LogsTab />
    </TabPanel>
  </>
);

// ─── TabPanel ────────────────────────────────────────────────────────────────

interface TabPanelProps {
  id: TabId;
  activeTab: TabId;
  children: React.ReactNode;
}

/**
 * Uses CSS visibility + absolute positioning so all panels remain mounted
 * (preserving state / scroll position) but only the active one is visible
 * and interactive.
 */
const TabPanel: React.FC<TabPanelProps> = ({ id, activeTab, children }) => {
  const isActive = id === activeTab;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!isActive}
      className={cn(
        "h-full w-full overflow-hidden",
        isActive ? "block" : "hidden"
      )}
    >
      {children}
    </div>
  );
};
export default AutopilotPreviewPanel;
