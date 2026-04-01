// src/components/phase/PhaseStatusBadge.tsx

import React from 'react';
import {
  EpicStatus,
  TaskCounts,
  PhaseDisplayStatus,
  getPhaseDisplayStatus,
  getPhaseStatusBadgeClasses,
  PHASE_STATUS_BADGE_CLASSES,
  defaultTaskCounts,
} from '../../utils/phaseStatus';

// ─── Props Variants ───────────────────────────────────────────────────────────

/**
 * Use epicStatus + taskCounts when you have raw data.
 */
interface PhaseStatusBadgeFromStatusProps {
  epicStatus: EpicStatus;
  taskCounts?: TaskCounts;
  displayStatus?: never;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

/**
 * Use displayStatus directly when you already have the resolved status.
 */
interface PhaseStatusBadgeFromDisplayProps {
  epicStatus?: never;
  taskCounts?: never;
  displayStatus: PhaseDisplayStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

type PhaseStatusBadgeProps =
  | PhaseStatusBadgeFromStatusProps
  | PhaseStatusBadgeFromDisplayProps;

// ─── Size Modifiers ───────────────────────────────────────────────────────────

const SIZE_OVERRIDES = {
  sm: {
    container: 'px-2 py-0.5 text-xs',
    dot: 'h-1 w-1',
  },
  md: {
    container: 'px-2.5 py-1 text-xs',
    dot: 'h-1.5 w-1.5',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PhaseStatusBadge
 *
 * Renders a colored pill badge indicating the current phase (epic) display status.
 * Accepts either:
 *  - epicStatus + taskCounts (raw) → auto-resolves display status
 *  - displayStatus (pre-resolved)
 *
 * @example
 * // From raw data:
 * <PhaseStatusBadge epicStatus="in_progress" taskCounts={{ total: 3, active: 2, completed: 1, pending: 0 }} />
 *
 * @example
 * // From pre-resolved status:
 * <PhaseStatusBadge displayStatus="Running" />
 */
export const PhaseStatusBadge: React.FC<PhaseStatusBadgeProps> = ({
  epicStatus,
  taskCounts = defaultTaskCounts(),
  displayStatus,
  size = 'md',
  showDot = true,
  className = '',
}) => {
  // Resolve which display status to use
  const resolvedStatus: PhaseDisplayStatus =
    displayStatus ?? getPhaseDisplayStatus(epicStatus!, taskCounts);

  const classes = PHASE_STATUS_BADGE_CLASSES[resolvedStatus];
  const sizeClasses = SIZE_OVERRIDES[size];

  // Merge size overrides into container classes
  // We replace the padding/text-size portion from the base container
  const containerBase = classes.container
    .replace(/px-\S+/, '')
    .replace(/py-\S+/, '')
    .replace(/text-\S+/, '')
    .trim();

  const containerClasses = [
    containerBase,
    sizeClasses.container,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const dotClasses = [
    classes.dot.replace(/h-\S+/, '').replace(/w-\S+/, '').trim(),
    sizeClasses.dot,
    // preserve animate-pulse for Running
    resolvedStatus === 'Running' ? 'animate-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={containerClasses} role="status" aria-label={`Phase status: ${resolvedStatus}`}>
      {showDot && (
        <span className={dotClasses} aria-hidden="true" />
      )}
      <span className={classes.text}>{resolvedStatus}</span>
    </span>
  );
};

export default PhaseStatusBadge;