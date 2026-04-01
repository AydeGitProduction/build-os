// src/components/PhaseHeaderBar/PhaseStatusBadge.tsx

import React from 'react';
import styles from './PhaseStatusBadge.module.css';
import type { PhaseStatus } from './PhaseHeaderBar';

interface PhaseStatusBadgeProps {
  status: PhaseStatus;
  className?: string;
  'data-testid'?: string;
}

const STATUS_CONFIG: Record<
  PhaseStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  not_started: {
    label: 'Not started',
    dotClass: styles.dotNotStarted,
    badgeClass: styles.badgeNotStarted,
  },
  in_progress: {
    label: 'In progress',
    dotClass: styles.dotInProgress,
    badgeClass: styles.badgeInProgress,
  },
  needs_review: {
    label: 'Needs review',
    dotClass: styles.dotNeedsReview,
    badgeClass: styles.badgeNeedsReview,
  },
  complete: {
    label: 'Complete',
    dotClass: styles.dotComplete,
    badgeClass: styles.badgeComplete,
  },
  blocked: {
    label: 'Blocked',
    dotClass: styles.dotBlocked,
    badgeClass: styles.badgeBlocked,
  },
};

export const PhaseStatusBadge: React.FC<PhaseStatusBadgeProps> = ({
  status,
  className,
  'data-testid': testId,
}) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;

  return (
    <span
      className={[styles.badge, config.badgeClass, className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
      aria-label={`Phase status: ${config.label}`}
      role="status"
    >
      <span
        className={[styles.dot, config.dotClass].filter(Boolean).join(' ')}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
};

export default PhaseStatusBadge;