'use client'
// src/components/tasks/TaskCard.tsx

import React from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { normalizeStatus, getStatusDisplay } from '../../utils/status-display';
import type { Task } from '../../types';

interface TaskCardProps {
  task: Task;
  onStatusChange?: (taskId: string, newStatus: string) => void;
  onClick?: (taskId: string) => void;
  compact?: boolean;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-sky-600 dark:text-sky-400',
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onStatusChange,
  onClick,
  compact = false,
}) => {
  const canonical = normalizeStatus(task.status);
  const statusDisplay = getStatusDisplay(task.status);

  // Left accent border matches status color
  const accentBorder: Record<string, string> = {
    running: 'border-l-green-500',
    blocked: 'border-l-red-500',
    done: 'border-l-emerald-500',
    planning: 'border-l-violet-500',
  };

  return (
    <article
      className={[
        'group relative flex gap-3 rounded-lg border border-gray-200 bg-white',
        'border-l-4',
        accentBorder[canonical],
        compact ? 'p-3' : 'p-4',
        'shadow-sm hover:shadow-md transition-shadow cursor-pointer',
        'dark:border-gray-700 dark:bg-gray-900 dark:border-l-4',
        // done tasks get reduced opacity
        canonical === 'done' ? 'opacity-60 hover:opacity-100' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onClick?.(task.id)}
      data-task-id={task.id}
      data-task-status={canonical}
    >
      {/* ── Done checkmark overlay ── */}
      {canonical === 'done' && (
        <div className="absolute top-2 right-2" aria-hidden="true">
          <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        {/* Row 1: Title + Status badge */}
        <div className="flex items-start justify-between gap-2">
          <h4
            className={[
              'text-sm font-medium leading-snug flex-1 min-w-0',
              canonical === 'done'
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-900 dark:text-white',
            ].join(' ')}
          >
            {task.title}
          </h4>

          {/* STATUS BADGE — centralized */}
          <StatusBadge status={task.status} size="sm" />
        </div>

        {/* Row 2: Description (non-compact only) */}
        {!compact && task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Row 3: Meta (priority, assignee, due date) */}
        <div className="flex items-center gap-3 flex-wrap">
          {task.priority && (
            <span
              className={[
                'text-[10px] font-semibold uppercase tracking-wide',
                PRIORITY_STYLES[task.priority.toLowerCase()] ?? 'text-gray-400',
              ].join(' ')}
            >
              {task.priority}
            </span>
          )}

          {task.assigneeInitials && (
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full
                         bg-gray-200 text-gray-600 text-[8px] font-bold
                         dark:bg-gray-700 dark:text-gray-300"
              title={task.assigneeName}
            >
              {task.assigneeInitials}
            </span>
          )}

          {task.dueDate && (
            <span
              className={[
                'text-[10px] tabular-nums',
                isPastDue(task.dueDate) && canonical !== 'done'
                  ? 'text-red-500 font-semibold'
                  : 'text-gray-400 dark:text-gray-500',
              ].join(' ')}
            >
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPastDue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default TaskCard;