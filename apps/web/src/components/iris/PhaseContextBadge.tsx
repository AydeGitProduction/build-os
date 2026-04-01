// src/components/iris/PhaseContextBadge.tsx
import React from 'react';
import type { Phase } from '@/types/phase';
import { buildTaskSummary } from '@/utils/irisContextBuilder';

interface PhaseContextBadgeProps {
  phase: Phase | null;
  className?: string;
}

const STATUS_STYLES: Record<Phase['status'], string> = {
  planned: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STATUS_DOT: Record<Phase['status'], string> = {
  planned: 'bg-slate-400',
  active: 'bg-blue-500 animate-pulse',
  completed: 'bg-emerald-500',
  archived: 'bg-amber-400',
};

export const PhaseContextBadge: React.FC<PhaseContextBadgeProps> = ({
  phase,
  className = '',
}) => {
  if (!phase) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium bg-gray-50 text-gray-400 border-gray-200 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        No phase selected
      </div>
    );
  }

  const summary = buildTaskSummary(phase);
  const statusStyle = STATUS_STYLES[phase.status];
  const dotStyle = STATUS_DOT[phase.status];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${statusStyle} ${className}`}
      title={`Phase: ${phase.title} | ${summary.completionPercentage}% complete`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
      <span className="truncate max-w-[180px]">{phase.title}</span>
      <span className="opacity-60 shrink-0">
        {summary.completionPercentage}%
      </span>
    </div>
  );
};

export default PhaseContextBadge;