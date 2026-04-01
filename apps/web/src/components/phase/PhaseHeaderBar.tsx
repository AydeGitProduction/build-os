// src/components/phase/PhaseHeaderBar.tsx

import React from 'react';
import { EpicStatus, TaskCounts, getPhaseDisplayStatus, defaultTaskCounts } from '../../utils/phaseStatus';
import { PhaseStatusBadge } from './PhaseStatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Phase {
  id: string;
  title: string;
  description?: string;
  epicStatus: EpicStatus;
  startDate?: string;
  endDate?: string;
  ownerName?: string;
  ownerAvatarUrl?: string;
  taskCounts?: TaskCounts;
}

interface PhaseHeaderBarProps {
  phase: Phase;
  isExpanded?: boolean;
  onToggle?: (phaseId: string) => void;
  onEditClick?: (phaseId: string) => void;
  className?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ taskCounts: TaskCounts }> = ({ taskCounts }) => {
  if (taskCounts.total === 0) return null;

  const completedPct = Math.round((taskCounts.completed / taskCounts.total) * 100);
  const activePct = Math.round((taskCounts.active / taskCounts.total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={completedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${completedPct}% complete`}
      >
        {/* Completed segment */}
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${completedPct}%` }}
        />
        {/* Active segment (overlaid as part of the remaining) */}
        <div
          className="relative -mt-1.5 h-full bg-blue-400 opacity-60 transition-all duration-500"
          style={{
            width: `${activePct}%`,
            marginLeft: `${completedPct}%`,
          }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">
        {taskCounts.completed}/{taskCounts.total}
      </span>
    </div>
  );
};

const TaskCountPills: React.FC<{ taskCounts: TaskCounts }> = ({ taskCounts }) => {
  if (taskCounts.total === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      {taskCounts.active > 0 && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-600">
          {taskCounts.active} active
        </span>
      )}
      {taskCounts.pending > 0 && (
        <span className="rounded bg-gray-50 px-1.5 py-0.5 font-medium text-gray-500">
          {taskCounts.pending} pending
        </span>
      )}
      {taskCounts.completed > 0 && (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-600">
          {taskCounts.completed} done
        </span>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * PhaseHeaderBar
 *
 * A collapsible header bar for a single phase/epic showing:
 *  - Phase title
 *  - Phase status badge (derived from epicStatus + taskCounts)
 *  - Progress bar
 *  - Task count breakdown
 *  - Optional date range, owner avatar, edit action
 */
export const PhaseHeaderBar: React.FC<PhaseHeaderBarProps> = ({
  phase,
  isExpanded = true,
  onToggle,
  onEditClick,
  className = '',
}) => {
  const taskCounts = phase.taskCounts ?? defaultTaskCounts();
  const displayStatus = getPhaseDisplayStatus(phase.epicStatus, taskCounts);

  const handleToggle = () => onToggle?.(phase.id);
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditClick?.(phase.id);
  };

  // Status-based left border accent color
  const borderAccentClass: Record<typeof displayStatus, string> = {
    'Not started': 'border-l-gray-300',
    'In discussion': 'border-l-amber-400',
    'Running': 'border-l-blue-500',
    'Done': 'border-l-emerald-500',
  };

  return (
    <div
      className={[
        'group relative flex items-center gap-3 border-l-4 bg-white px-4 py-3',
        'cursor-pointer select-none rounded-r-lg shadow-sm',
        'transition-all duration-200 hover:bg-gray-50 hover:shadow',
        borderAccentClass[displayStatus],
        className,
      ].join(' ')}
      onClick={handleToggle}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`Phase: ${phase.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      }}
    >
      {/* Chevron toggle */}
      <span
        className={[
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded',
          'text-gray-400 transition-transform duration-200',
          isExpanded ? 'rotate-90' : 'rotate-0',
        ].join(' ')}
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
      </span>

      {/* Phase title */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {phase.title}
          </h3>
          <PhaseStatusBadge
            epicStatus={phase.epicStatus}
            taskCounts={taskCounts}
            size="sm"
          />
        </div>

        {phase.description && (
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {phase.description}
          </p>
        )}
      </div>

      {/* Meta section: progress, tasks, date */}
      <div className="flex flex-shrink-0 items-center gap-4">
        <ProgressBar taskCounts={taskCounts} />
        <TaskCountPills taskCounts={taskCounts} />

        {/* Date range */}
        {(phase.startDate || phase.endDate) && (
          <div className="hidden text-xs text-gray-400 sm:block">
            {phase.startDate && (
              <span>{new Date(phase.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            )}
            {phase.startDate && phase.endDate && (
              <span className="mx-1">–</span>
            )}
            {phase.endDate && (
              <span>{new Date(phase.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            )}
          </div>
        )}

        {/* Owner avatar */}
        {phase.ownerAvatarUrl && (
          <img
            src={phase.ownerAvatarUrl}
            alt={phase.ownerName ?? 'Owner'}
            className="h-6 w-6 rounded-full object-cover ring-1 ring-white"
            title={phase.ownerName}
          />
        )}

        {/* Edit button */}
        {onEditClick && (
          <button
            type="button"
            className={[
              'hidden items-center justify-center rounded p-1',
              'text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600',
              'group-hover:flex',
            ].join(' ')}
            onClick={handleEdit}
            aria-label={`Edit phase ${phase.title}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default PhaseHeaderBar;