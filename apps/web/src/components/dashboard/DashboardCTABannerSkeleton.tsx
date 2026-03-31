// src/components/dashboard/DashboardCTABannerSkeleton.tsx

'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardCTABannerSkeletonProps {
  className?: string;
}

export function DashboardCTABannerSkeleton({
  className,
}: DashboardCTABannerSkeletonProps) {
  return (
    <div
      className={cn(
        'w-full rounded-xl border border-slate-800/60 bg-slate-900/60 overflow-hidden',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-4 px-5 py-4 sm:px-6 sm:py-5">
        {/* Icon skeleton */}
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-800 animate-pulse" />

        {/* Text skeleton */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-28 rounded-full bg-slate-800 animate-pulse" />
          <div className="h-3.5 w-64 rounded bg-slate-800/80 animate-pulse" />
        </div>

        {/* Button skeleton */}
        <div className="flex-shrink-0 h-9 w-36 rounded-lg bg-slate-800 animate-pulse" />
      </div>
    </div>
  );
}

export default DashboardCTABannerSkeleton;