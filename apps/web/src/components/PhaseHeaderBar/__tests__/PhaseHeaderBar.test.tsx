// src/components/PhaseHeaderBar/__tests__/PhaseHeaderBar.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhaseHeaderBar } from '../PhaseHeaderBar';
import type { Phase } from '../../../types/phase';

const mockPhaseInProgress: Phase = {
  id: 'phase-1',
  name: 'Discovery',
  status: 'in_progress',
};

const mockPhaseComplete: Phase = {
  id: 'phase-2',
  name: 'Design Sprint',
  status: 'complete',
};

const mockPhaseBlocked: Phase = {
  id: 'phase-3',
  name: 'Build Phase',
  status: 'blocked',
};

describe('PhaseHeaderBar', () => {
  /* ── No phase selected ─────────────────────────────────────────────────── */
  describe('when no phase is selected', () => {
    it('renders "Smart Wizard" as the default label', () => {
      render(<PhaseHeaderBar />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Smart Wizard'
      );
    });

    it('does not render a status badge', () => {
      render(<PhaseHeaderBar />);
      expect(screen.queryByTestId('phase-header-status')).toBeNull();
    });

    it('renders "Select phase" for the switch link', () => {
      render(<PhaseHeaderBar onSwitchPhase={jest.fn()} />);
      expect(screen.getByTestId('phase-header-switch')).toHaveTextContent(
        'Select phase'
      );
    });

    it('respects a custom defaultLabel', () => {
      render(<PhaseHeaderBar defaultLabel="General Chat" />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'General Chat'
      );
    });
  });

  /* ── Phase selected ────────────────────────────────────────────────────── */
  describe('when a phase is selected', () => {
    it('renders the phase name', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseInProgress} />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Discovery'
      );
    });

    it('renders the status badge with correct label', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseInProgress} />);
      const badge = screen.getByTestId('phase-header-status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('In progress');
    });

    it('renders "Switch phase" for the switch link', () => {
      render(
        <PhaseHeaderBar
          selectedPhase={mockPhaseInProgress}
          onSwitchPhase={jest.fn()}
        />
      );
      expect(screen.getByTestId('phase-header-switch')).toHaveTextContent(
        'Switch phase'
      );
    });

    it('renders "Complete" badge for complete phase', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseComplete} />);
      expect(screen.getByTestId('phase-header-status')).toHaveTextContent(
        'Complete'
      );
    });

    it('renders "Blocked" badge for blocked phase', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseBlocked} />);
      expect(screen.getByTestId('phase-header-status')).toHaveTextContent(
        'Blocked'
      );
    });
  });

  /* ── Switch link behaviour ─────────────────────────────────────────────── */
  describe('switch link', () => {
    it('calls onSwitchPhase when switch button is clicked', () => {
      const onSwitch = jest.fn();
      render(
        <PhaseHeaderBar
          selectedPhase={mockPhaseInProgress}
          onSwitchPhase={onSwitch}
        />
      );
      fireEvent.click(screen.getByTestId('phase-header-switch'));
      expect(onSwitch).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onSwitchPhase is not provided', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseInProgress} />);
      expect(() =>
        fireEvent.click(screen.getByTestId('phase-header-switch'))
      ).not.toThrow();
    });

    it('hides switch link when showSwitchLink=false', () => {
      render(
        <PhaseHeaderBar
          selectedPhase={mockPhaseInProgress}
          showSwitchLink={false}
        />
      );
      expect(screen.queryByTestId('phase-header-switch')).toBeNull();
    });
  });

  /* ── Phase change (reactivity) ─────────────────────────────────────────── */
  describe('reactivity', () => {
    it('updates when selectedPhase changes from null to a phase', () => {
      const { rerender } = render(<PhaseHeaderBar selectedPhase={null} />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Smart Wizard'
      );

      rerender(<PhaseHeaderBar selectedPhase={mockPhaseInProgress} />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Discovery'
      );
      expect(screen.getByTestId('phase-header-status')).toHaveTextContent(
        'In progress'
      );
    });

    it('updates when selectedPhase name changes', () => {
      const { rerender } = render(
        <PhaseHeaderBar selectedPhase={mockPhaseInProgress} />
      );
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Discovery'
      );

      rerender(<PhaseHeaderBar selectedPhase={mockPhaseComplete} />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Design Sprint'
      );
    });

    it('updates when phase status changes', () => {
      const { rerender } = render(
        <PhaseHeaderBar selectedPhase={mockPhaseInProgress} />
      );
      expect(screen.getByTestId('phase-header-status')).toHaveTextContent(
        'In progress'
      );

      rerender(
        <PhaseHeaderBar
          selectedPhase={{ ...mockPhaseInProgress, status: 'complete' }}
        />
      );
      expect(screen.getByTestId('phase-header-status')).toHaveTextContent(
        'Complete'
      );
    });

    it('reverts to Smart Wizard when phase deselected', () => {
      const { rerender } = render(
        <PhaseHeaderBar selectedPhase={mockPhaseInProgress} />
      );
      rerender(<PhaseHeaderBar selectedPhase={null} />);
      expect(screen.getByTestId('phase-header-name')).toHaveTextContent(
        'Smart Wizard'
      );
      expect(screen.queryByTestId('phase-header-status')).toBeNull();
    });
  });

  /* ── Accessibility ─────────────────────────────────────────────────────── */
  describe('accessibility', () => {
    it('has banner role with descriptive aria-label', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseInProgress} />);
      const banner = screen.getByRole('banner');
      expect(banner).toHaveAttribute('aria-label', 'Current phase: Discovery');
    });

    it('switch button is keyboard-focusable', () => {
      render(
        <PhaseHeaderBar
          selectedPhase={mockPhaseInProgress}
          onSwitchPhase={jest.fn()}
        />
      );
      const btn = screen.getByTestId('phase-header-switch');
      btn.focus();
      expect(btn).toHaveFocus();
    });

    it('status badge has role="status"', () => {
      render(<PhaseHeaderBar selectedPhase={mockPhaseInProgress} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  /* ── className passthrough ─────────────────────────────────────────────── */
  it('applies custom className to root element', () => {
    render(
      <PhaseHeaderBar
        selectedPhase={mockPhaseInProgress}
        className="custom-override"
      />
    );
    expect(screen.getByTestId('phase-header-bar')).toHaveClass(
      'custom-override'
    );
  });
});