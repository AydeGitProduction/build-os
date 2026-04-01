// src/components/PhaseHeaderBar/__tests__/PhaseStatusBadge.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PhaseStatusBadge } from '../PhaseStatusBadge';

const allStatuses = [
  { status: 'not_started' as const, label: 'Not started' },
  { status: 'in_progress' as const, label: 'In progress' },
  { status: 'needs_review' as const, label: 'Needs review' },
  { status: 'complete' as const, label: 'Complete' },
  { status: 'blocked' as const, label: 'Blocked' },
];

describe('PhaseStatusBadge', () => {
  it.each(allStatuses)(
    'renders "$label" for status "$status"',
    ({ status, label }) => {
      render(<PhaseStatusBadge status={status} data-testid="badge" />);
      expect(screen.getByTestId('badge')).toHaveTextContent(label);
    }
  );

  it.each(allStatuses)(
    'has aria-label "Phase status: $label" for status "$status"',
    ({ status, label }) => {
      render(<PhaseStatusBadge status={status} data-testid="badge" />);
      expect(screen.getByTestId('badge')).toHaveAttribute(
        'aria-label',
        `Phase status: ${label}`
      );
    }
  );

  it('applies custom className', () => {
    render(
      <PhaseStatusBadge
        status="complete"
        className="extra-class"
        data-testid="badge"
      />
    );
    expect(screen.getByTestId('badge')).toHaveClass('extra-class');
  });
});