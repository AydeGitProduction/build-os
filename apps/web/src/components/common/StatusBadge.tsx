// src/components/common/StatusBadge.tsx

import React from 'react';
import { getStatusDisplay } from '../../utils/status-display';
import type { AppStatus } from '../../utils/status-display';

interface StatusBadgeProps {
  /** Raw status string — will be normalized automatically */
  status: string | undefined | null;
  /** Optional size override */
  size?: 'sm' | 'md' | 'lg';
  /** Show/hide the dot indicator (default: true) */
  showDot?: boolean;
  /** Additional CSS classes to merge onto the badge */
  className?: string;
}

const SIZE_OVERRIDES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-1.5 py-0 text-[10px]',
  md: '', // default — no override needed
  lg: 'px-3 py-1 text-sm',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
  className = '',
}) => {
  const display = getStatusDisplay(status);
  const sizeClass = SIZE_OVERRIDES[size];

  return (
    <span
      className={[display.badgeClasses, sizeClass, className].filter(Boolean).join(' ')}
      role="status"
      aria-label={display.ariaLabel}
    >
      {showDot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
          {display.pulse && (
            <span
              className={[
                'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                // Match the dot color for the ping
                display.dotClasses.replace('bg-', 'bg-').split(' ').find(c => c.startsWith('bg-')) ?? '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          )}
          <span className={['relative inline-flex rounded-full', display.dotClasses].join(' ')} />
        </span>
      )}
      {display.label}
    </span>
  );
};

export default StatusBadge;

// src/components/common/StatusBadge.tsx  (final version)

import React from 'react';
import { getStatusDisplay } from '../../utils/status-display';

interface StatusBadgeProps {
  status: string | undefined | null;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
}

/** Maps the bg-* color token used in dotClasses so the ping layer matches exactly */
function extractBgColor(dotClasses: string): string {
  const match = dotClasses.match(/bg-[\w-]+/);
  return match ? match[0] : 'bg-gray-400';
}

const sizeMap = {
  sm: 'px-1.5 py-0 text-[10px]',
  md: '',
  lg: 'px-3 py-1 text-sm',
} as const;

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
  className = '',
}) => {
  const d = getStatusDisplay(status);
  const bgColor = extractBgColor(d.dotClasses);

  return (
    <span
      className={[d.badgeClasses, sizeMap[size], className].filter(Boolean).join(' ')}
      role="status"
      aria-label={d.ariaLabel}
    >
      {showDot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
          {d.pulse && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${bgColor}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${bgColor}`} />
        </span>
      )}
      {d.label}
    </span>
  );
};

export default StatusBadge;