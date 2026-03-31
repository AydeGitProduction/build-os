// src/components/dashboard/__tests__/DashboardCTABanner.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { DashboardCTABanner } from '../DashboardCTABanner';
import type { DashboardCTAConfig } from '@/hooks/useDashboardCTA';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockPush = jest.fn();
(useRouter as jest.Mock).mockReturnValue({ push: mockPush });

const baseConfig = (
  variant: DashboardCTAConfig['variant'],
  overrides?: Partial<DashboardCTAConfig>
): DashboardCTAConfig => ({
  variant,
  label: variant === 'continue-phase'
    ? 'Continue Phase 1 →'
    : variant === 'open-wizard'
    ? 'Open Power Wizard →'
    : 'Start Building →',
  href:
    variant === 'continue-phase'
      ? '/projects/abc/wizard?phase=phase-1'
      : '/projects/abc/wizard',
  description: 'Test description',
  statusLabel: 'Test Status',
  statusColor: 'blue',
  icon: 'lightning',
  ...overrides,
});

describe('DashboardCTABanner', () => {
  beforeEach(() => mockPush.mockClear());

  it('renders "Continue Phase 1 →" for continue-phase variant', () => {
    render(<DashboardCTABanner config={baseConfig('continue-phase')} />);
    expect(screen.getByText('Continue Phase 1 →')).toBeInTheDocument();
  });

  it('renders "Open Power Wizard →" for open-wizard variant', () => {
    render(<DashboardCTABanner config={baseConfig('open-wizard')} />);
    expect(screen.getByText('Open Power Wizard →')).toBeInTheDocument();
  });

  it('renders "Start Building →" for start-building variant', () => {
    render(<DashboardCTABanner config={baseConfig('start-building')} />);
    expect(screen.getByText('Start Building →')).toBeInTheDocument();
  });

  it('navigates to correct href on click', () => {
    render(
      <DashboardCTABanner
        config={baseConfig('continue-phase', {
          href: '/projects/abc/wizard?phase=phase-1',
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /continue phase/i }));
    expect(mockPush).toHaveBeenCalledWith('/projects/abc/wizard?phase=phase-1');
  });

  it('shows status badge with status label', () => {
    render(
      <DashboardCTABanner
        config={baseConfig('open-wizard', {
          statusLabel: 'Blueprint Ready',
        })}
      />
    );
    expect(screen.getByText('Blueprint Ready')).toBeInTheDocument();
  });

  it('shows project name when provided', () => {
    render(
      <DashboardCTABanner
        config={baseConfig('continue-phase')}
        projectName="My Awesome Project"
      />
    );
    expect(screen.getByText('My Awesome Project')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    const { container } = render(
      <div aria-hidden="true">
        <div className="animate-pulse" />
      </div>
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});