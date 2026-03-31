// apps/web/src/components/RightPanel/tabs/BlueprintTab.tsx
import React from 'react';
import { FileText } from 'lucide-react';

export const BlueprintTab: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
        <FileText className="w-6 h-6 text-zinc-500" />
      </div>
      <p className="text-zinc-300 font-semibold text-sm">Blueprint</p>
      <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
        Your project blueprint will appear here once IRIS has generated it.
      </p>
    </div>
  );
};

export default BlueprintTab;
