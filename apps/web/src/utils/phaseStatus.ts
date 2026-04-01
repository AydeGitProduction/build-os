// src/utils/phaseStatus.ts

/**
 * Represents the possible display statuses for a phase (epic).
 */
export type PhaseDisplayStatus = 
  | 'Not started'
  | 'In discussion'
  | 'Running'
  | 'Done';

/**
 * Represents the raw epic status values from the backend/store.
 */
export type EpicStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | string; // fallback for extensibility

/**
 * Counts of tasks within the phase/epic.
 */
export interface TaskCounts {
  total: number;
  active: number;       // tasks currently in progress
  completed: number;
  pending: number;
}

/**
 * Maps an epic's status and its task counts to a human-readable phase display status.
 *
 * Logic:
 *  - "Not started"  → epicStatus is 'pending' AND total tasks === 0
 *  - "In discussion" → epicStatus is 'in_progress' AND active tasks === 0
 *  - "Running"       → epicStatus is 'in_progress' AND active tasks > 0
 *  - "Done"          → epicStatus is 'completed'
 *
 * @param epicStatus - The raw status of the epic from the data layer
 * @param taskCounts - Object containing counts of tasks in various states
 * @returns PhaseDisplayStatus - human-readable status string
 */
export function getPhaseDisplayStatus(
  epicStatus: EpicStatus,
  taskCounts: TaskCounts
): PhaseDisplayStatus {
  switch (epicStatus) {
    case 'completed':
      return 'Done';

    case 'in_progress':
      return taskCounts.active > 0 ? 'Running' : 'In discussion';

    case 'pending':
    default:
      // Even if pending has tasks added, we treat 0 total as "Not started"
      // and any tasks present still "Not started" until moved to in_progress
      return 'Not started';
  }
}

/**
 * Tailwind CSS classes for each phase display status badge.
 * Each entry contains:
 *  - container: wrapper/background classes
 *  - dot: indicator dot color
 *  - text: text color class
 *  - label: the display label (matches PhaseDisplayStatus)
 */
export interface StatusBadgeClasses {
  container: string;
  dot: string;
  text: string;
  label: PhaseDisplayStatus;
}

/**
 * Record mapping each PhaseDisplayStatus to its colored Tailwind badge classes.
 */
export const PHASE_STATUS_BADGE_CLASSES: Record<PhaseDisplayStatus, StatusBadgeClasses> = {
  'Not started': {
    label: 'Not started',
    container: 'inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium',
    dot: 'h-1.5 w-1.5 rounded-full bg-gray-400',
    text: 'text-gray-600',
  },
  'In discussion': {
    label: 'In discussion',
    container: 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium',
    dot: 'h-1.5 w-1.5 rounded-full bg-amber-400',
    text: 'text-amber-700',
  },
  'Running': {
    label: 'Running',
    container: 'inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium',
    dot: 'h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse',
    text: 'text-blue-700',
  },
  'Done': {
    label: 'Done',
    container: 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium',
    dot: 'h-1.5 w-1.5 rounded-full bg-emerald-500',
    text: 'text-emerald-700',
  },
};

/**
 * Convenience function: returns the full badge class configuration
 * for a given epic status and task counts combo.
 *
 * @param epicStatus - Raw epic status
 * @param taskCounts - Task count breakdown
 * @returns StatusBadgeClasses - Tailwind class configuration for the badge
 */
export function getPhaseStatusBadgeClasses(
  epicStatus: EpicStatus,
  taskCounts: TaskCounts
): StatusBadgeClasses {
  const displayStatus = getPhaseDisplayStatus(epicStatus, taskCounts);
  return PHASE_STATUS_BADGE_CLASSES[displayStatus];
}

/**
 * Helper to build a default TaskCounts object (all zeros).
 */
export function defaultTaskCounts(): TaskCounts {
  return { total: 0, active: 0, completed: 0, pending: 0 };
}

/**
 * Helper to derive TaskCounts from an array of task objects.
 * Tasks are expected to have a `status` field of 'pending' | 'in_progress' | 'completed'.
 */
export function deriveTaskCounts(
  tasks: Array<{ status: string }>
): TaskCounts {
  return tasks.reduce<TaskCounts>(
    (counts, task) => {
      counts.total += 1;
      if (task.status === 'in_progress') counts.active += 1;
      else if (task.status === 'completed') counts.completed += 1;
      else counts.pending += 1;
      return counts;
    },
    { total: 0, active: 0, completed: 0, pending: 0 }
  );
}