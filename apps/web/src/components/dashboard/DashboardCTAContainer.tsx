// src/components/dashboard/DashboardCTAContainer.tsx

'use client';

import React, { Suspense } from 'react';
import { useDashboardCTA } from '@/hooks/useDashboardCTA';
import { DashboardCTABanner } from './DashboardCTABanner';
import { DashboardCTABannerSkeleton } from './DashboardCTABannerSkeleton';
import type { Project, Phase, Blueprint } from '@/types';

interface DashboardCTAContainerProps {
  project: Project;
  phases?: Phase[];
  blueprint?: Blueprint | null;
  isLoading?: boolean;
  className?: string;
}

export function DashboardCTAContainer({
  project,
  phases = [],
  blueprint = null,
  isLoading = false,
  className,
}: DashboardCTAContainerProps) {
  const config = useDashboardCTA({ project, phases, blueprint });

  if (isLoading) {
    return <DashboardCTABannerSkeleton className={className} />;
  }

  return (
    <DashboardCTABanner
      config={config}
      projectName={project.name}
      className={className}
    />
  );
}

export default DashboardCTAContainer;