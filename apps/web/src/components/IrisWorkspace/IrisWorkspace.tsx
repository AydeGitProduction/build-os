// src/components/IrisWorkspace/IrisWorkspace.tsx
// ── Showing only the relevant sections with diff-style annotations ──────────

import React, { useState, useCallback } from 'react';
// ... existing imports ...
import { PhaseHeaderBar } from '../PhaseHeaderBar';
import type { Phase } from '../../types/phase';
import styles from './IrisWorkspace.module.css';

interface IrisWorkspaceProps {
  projectId?: string;
  // ... other existing props ...
  /** Initial or controlled phase selection */
  initialPhase?: Phase | null;
  /** Called when user requests to change phase */
  onRequestPhaseChange?: () => void;
}

export const IrisWorkspace: React.FC<IrisWorkspaceProps> = ({
  projectId,
  initialPhase = null,
  onRequestPhaseChange,
  // ... rest of existing props ...
}) => {
  // ── Phase state ────────────────────────────────────────────────────────────
  const [selectedPhase, setSelectedPhase] = useState<Phase | null>(
    initialPhase
  );

  // Keep selectedPhase in sync if parent passes a new initialPhase
  // (use useEffect with a "controlled" pattern if needed)
  React.useEffect(() => {
    setSelectedPhase(initialPhase ?? null);
  }, [initialPhase]);

  const handleSwitchPhase = useCallback(() => {
    // Notify parent (e.g. open phase selector modal/drawer)
    onRequestPhaseChange?.();
  }, [onRequestPhaseChange]);

  // ... existing state and handlers ...

  return (
    <div className={styles.workspace}>
      {/* ── Left sidebar / project tree (unchanged) ─────────────────────── */}
      {/* ... */}

      {/* ── Chat panel ───────────────────────────────────────────────────── */}
      <div className={styles.chatPanel}>

        {/*
          ┌─────────────────────────────────────────┐  ← 40px
          │  ● Discovery Phase   [In progress]  Switch phase ↓  │
          └─────────────────────────────────────────┘
          ─────── bottom border ────────────────────
        */}
        <PhaseHeaderBar
          selectedPhase={selectedPhase}
          onSwitchPhase={handleSwitchPhase}
          showSwitchLink={true}
          data-testid="iris-phase-header"
        />

        {/* ── Message list (was preceded by "Tell IRIS" heading) ─────────── */}
        <div className={styles.messageList}>
          {/* REMOVED: <h2 className={styles.tellIrisHeading}>Tell IRIS</h2> */}
          {/* ... message items ... */}
        </div>

        {/* ── Input area (unchanged) ────────────────────────────────────── */}
        <div className={styles.inputArea}>
          {/* ... */}
        </div>

      </div>
    </div>
  );
};