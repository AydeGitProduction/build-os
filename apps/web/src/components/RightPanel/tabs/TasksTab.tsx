// apps/web/src/components/RightPanel/tabs/TasksTab.tsx
import React from 'react';
import { ListChecks } from 'lucide-react';

export const TasksTab: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
        <ListChecks className="w-6 h-6 text-zinc-500" />
      </div>
      <p className="text-zinc-300 font-semibold text-sm">Tasks</p>
      <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
        Your project tasks and their execution status will appear here.
      </p>
    </div>
  );
};

export default TasksTab;
