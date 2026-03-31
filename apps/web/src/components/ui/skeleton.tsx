// apps/web/src/components/ui/skeleton.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('animate-pulse rounded-md bg-zinc-800', className)}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

export default Skeleton;
