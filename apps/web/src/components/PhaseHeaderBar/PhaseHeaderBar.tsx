'use client'
// src/components/PhaseHeaderBar/PhaseHeaderBar.tsx

import React, { useCallback } from 'react';
import styles from './PhaseHeaderBar.module.css';
import { PhaseStatusBadge } from './PhaseStatusBadge';
import type { Phase } from '../../types/phase';

export type PhaseStatus =
  | 'not_started'
  | 'in_progress'
  | 'needs_review'
  | 'complete'
  | 'blocked';

export interface PhaseHeaderBarProps {
  /** The currently selected phase, or null/undefined if none */
  selectedPhase?: Phase | null;
  /** Callback when user clicks "Switch phase" */
  onSwitchPhase?: () => void;
  /** Optional override for the display name when no phase is selected */
  defaultLabel?: string;
  /** Whether to show the switch phase link */
  showSwitchLink?: boolean;
  /** Extra class for the root element */
  className?: string;
  /** Data test id */
  'data-testid'?: string;
}

const SMART_WIZARD_LABEL = 'Smart Wizard';

export const PhaseHeaderBar: React.FC<PhaseHeaderBarProps> = ({
  selectedPhase,
  onSwitchPhase,
  defaultLabel = SMART_WIZARD_LABEL,
  showSwitchLink = true,
  className,
  'data-testid': testId = 'phase-header-bar',
}) => {
  const phaseName = selectedPhase?.name ?? defaultLabel;
  const phaseStatus: PhaseStatus = selectedPhase?.status ?? 'not_started';
  const isSmartWizard = !selectedPhase;

  const handleSwitchClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onSwitchPhase?.();
    },
    [onSwitchPhase]
  );

  return (
    <div
      className={[styles.phaseHeaderBar, className].filter(Boolean).join(' ')}
      data-testid={testId}
      role="banner"
      aria-label={`Current phase: ${phaseName}`}
    >
      {/* Phase Icon */}
      <span
        className={[
          styles.phaseIcon,
          isSmartWizard ? styles.phaseIconWizard : styles.phaseIconPhase,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      >
        {isSmartWizard ? (
          <WizardIcon />
        ) : (
          <PhaseIcon />
        )}
      </span>

      {/* Phase Name */}
      <span
        className={styles.phaseName}
        title={phaseName}
        data-testid="phase-header-name"
      >
        {phaseName}
      </span>

      {/* Status Badge — only when a real phase is selected */}
      {selectedPhase && (
        <PhaseStatusBadge
          status={phaseStatus}
          className={styles.statusBadge}
          data-testid="phase-header-status"
        />
      )}

      {/* Spacer */}
      <span className={styles.spacer} aria-hidden="true" />

      {/* Switch Phase Link */}
      {showSwitchLink && (
        <button
          type="button"
          className={styles.switchLink}
          onClick={handleSwitchClick}
          data-testid="phase-header-switch"
          aria-label="Switch to a different phase"
        >
          {isSmartWizard ? 'Select phase' : 'Switch phase'}
          <ChevronDownIcon className={styles.switchLinkIcon} />
        </button>
      )}
    </div>
  );
};

/* ─── Inline micro-icons (no extra deps) ─────────────────────────────────── */

const WizardIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8 1L9.854 5.146 14 6.09 11 9.146l.618 4.27L8 11.29l-3.618 2.126L5 9.146 2 6.09l4.146-.944L8 1Z"
      fill="currentColor"
    />
  </svg>
);

const PhaseIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="3" fill="currentColor" />
    <path
      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M2 3.5L5 6.5L8 3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default PhaseHeaderBar;