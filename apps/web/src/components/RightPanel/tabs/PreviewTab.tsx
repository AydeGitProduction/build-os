// apps/web/src/components/RightPanel/tabs/PreviewTab.tsx
import React from 'react';
import { Eye } from 'lucide-react';

export const PreviewTab: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
        <Eye className="w-6 h-6 text-zinc-500" />
      </div>
      <p className="text-zinc-300 font-semibold text-sm">Preview</p>
      <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
        A live preview of your project will appear here once it&apos;s running.
      </p>
    </div>
  );
};

export default PreviewTab;
