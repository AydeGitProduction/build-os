// src/components/integrations/LastTested.tsx

import React, { useEffect, useState } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

interface LastTestedProps {
  lastTestedAt: string | null;
  className?: string;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never tested';

  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'Just now';

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'Just now';
  if (diffSecs < 60) return `${diffSecs} seconds ago`;
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined,
  });
}

export function LastTested({ lastTestedAt, className }: LastTestedProps) {
  const [relativeTime, setRelativeTime] = useState(() =>
    formatRelativeTime(lastTestedAt)
  );

  // Update relative time every 30 seconds
  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastTestedAt));

    if (!lastTestedAt) return;

    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastTestedAt));
    }, 30_000);

    return () => clearInterval(interval);
  }, [lastTestedAt]);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400',
        className
      )}
      title={
        lastTestedAt
          ? `Last tested: ${new Date(lastTestedAt).toLocaleString()}`
          : 'Connection has never been tested'
      }
    >
      <ClockIcon className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        Last tested: <span className="font-medium">{relativeTime}</span>
      </span>
    </div>
  );
}