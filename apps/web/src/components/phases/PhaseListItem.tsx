// src/components/phases/PhaseListItem.tsx

import React, { useState } from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { normalizeStatus } from '../../utils/status-display';
import type { Phase, Task } from '../../types';

interface PhaseListItemProps {
  phase: Phase;
  tasks?: Task[];
  onStatusChange?: (phaseId: string, newStatus: string) => void;
  onExpand?: (phaseId: string) => void;
  defaultExpanded?: boolean;
}

export const PhaseListItem: React.FC<PhaseListItemProps> = ({
  phase,
  tasks = [],
  onStatusChange,
  onExpand,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canonical = normalizeStatus(phase.status);

  const handleToggle = () => {
    setExpanded((prev) => !prev);
    onExpand?.(phase.id);
  };

  const completedTasks = tasks.filter((t) => normalizeStatus(t.status) === 'done').length;
  const progressPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <li className="group" data-phase-id={phase.id} data-phase-status={canonical}>
      {/* ── Phase header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg
                   hover:bg-gray-50 dark:hover:bg-gray-800/50
                   transition-colors cursor-pointer select-none"
        onClick={handleToggle}
        role="button"
        aria-expanded={expanded}
        aria-controls={`phase-tasks-${phase.id}`}
      >
        {/* Expand chevron */}
        <svg
          className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200
                      ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>

        {/* Phase name */}
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">
          {phase.name}
        </span>

        {/* Task counter */}
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {completedTasks}/{tasks.length}
        </span>

        {/* STATUS BADGE — centralized */}
        <StatusBadge status={phase.status} size="sm" />
      </div>

      {/* ── Progress bar ── */}
      {tasks.length > 0 && (
        <div className="mx-4 mb-1">
          <div className="h-0.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-0.5 rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${progressPct}% complete`}
            />
          </div>
        </div>
      )}

      {/* ── Task list ── */}
      {expanded && tasks.length > 0 && (
        <ul
          id={`phase-tasks-${phase.id}`}
          className="ml-7 mt-1 flex flex-col gap-1 pb-2"
          aria-label={`Tasks in phase ${phase.name}`}
        >
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs
                         text-gray-700 dark:text-gray-300
                         hover:bg-gray-50 dark:hover:bg-gray-800/40"
            >
              <span className="flex-1 line-clamp-1">{task.title}</span>
              <StatusBadge status={task.status} size="sm" showDot={false} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export default PhaseListItem;