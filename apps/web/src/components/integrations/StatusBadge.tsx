// src/components/integrations/StatusBadge.tsx

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '@/types/integrations';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide transition-colors',
  {
    variants: {
      status: {
        connected:
          'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
        expired:
          'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
        error:
          'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
        not_connected:
          'bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700',
      },
    },
    defaultVariants: {
      status: 'not_connected',
    },
  }
);

const dotVariants = cva('h-1.5 w-1.5 rounded-full', {
  variants: {
    status: {
      connected: 'bg-emerald-500 animate-pulse',
      expired: 'bg-amber-500',
      error: 'bg-red-500',
      not_connected: 'bg-gray-400',
    },
  },
  defaultVariants: {
    status: 'not_connected',
  },
});

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  expired: 'Expired',
  error: 'Error',
  not_connected: 'Not Connected',
};

interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: ConnectionStatus;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({
  status,
  className,
  showDot = true,
}: StatusBadgeProps) {
  return (
    <span className={cn(badgeVariants({ status }), className)}>
      {showDot && <span className={dotVariants({ status })} />}
      {STATUS_LABELS[status]}
    </span>
  );
}