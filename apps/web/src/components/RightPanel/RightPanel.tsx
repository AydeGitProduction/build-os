// src/components/RightPanel/RightPanel.tsx
import React from 'react';
import { TabPanel, TabDefinition } from './TabPanel';
import { PreviewTab } from './tabs/PreviewTab';
import { TasksTab } from './tabs/TasksTab';
import { BlueprintTab } from './tabs/BlueprintTab';

// Icons (inline SVG for zero-dependency)
const PreviewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const TasksIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BlueprintIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 4h6M4 7h4M4 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

interface RightPanelProps {
  defaultTab?: 'preview' | 'tasks' | 'blueprint';
  taskCount?: number;
  className?: string;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  defaultTab = 'preview',
  taskCount,
  className,
}) => {
  const tabs: TabDefinition[] = [
    {
      id: 'preview',
      label: 'Preview',
      icon: <PreviewIcon />,
      content: <PreviewTab />,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: <TasksIcon />,
      badge: taskCount,
      content: <TasksTab />,
    },
    {
      id: 'blueprint',
      label: 'Blueprint',
      icon: <BlueprintIcon />,
      content: <BlueprintTab />,
    },
  ];

  return (
    <aside className={className} style={{ width: '100%', height: '100%' }}>
      <TabPanel
        tabs={tabs}
        defaultTab={defaultTab}
        onTabChange={(id) => console.log('[RightPanel] tab changed to:', id)}
      />
    </aside>
  );
};

export default RightPanel;