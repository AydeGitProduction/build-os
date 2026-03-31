// src/components/dashboard/CommandCenterOverview.tsx

'use client';

import React from 'react';
import { DashboardCTAContainer } from '@/components/dashboard/DashboardCTAContainer';
import { DashboardCTABannerSkeleton } from '@/components/dashboard/DashboardCTABannerSkeleton';
import { useProject } from '@/hooks/useProject';
import { useProjectPhases } from '@/hooks/useProjectPhases';
import { useProjectBlueprint } from '@/hooks/useProjectBlueprint';

interface CommandCenterOverviewProps {
  projectId: string;
}

export function CommandCenterOverview({ projectId }: CommandCenterOverviewProps) {
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: phases, isLoading: phasesLoading } = useProjectPhases(projectId);
  const { data: blueprint, isLoading: blueprintLoading } = useProjectBlueprint(projectId);

  const isLoading = projectLoading || phasesLoading || blueprintLoading;

  return (
    <div className="space-y-6">
      {/* ── CTA Banner — top of content, before stat cards ── */}
      {isLoading || !project ? (
        <DashboardCTABannerSkeleton />
      ) : (
        <DashboardCTAContainer
          project={project}
          phases={phases ?? []}
          blueprint={blueprint ?? null}
          isLoading={isLoading}
        />
      )}

      {/* ── Stat Cards ── */}
      <StatCardsGrid
        project={project}
        phases={phases}
        isLoading={isLoading}
      />

      {/* ── Additional dashboard sections ── */}
    </div>
  );
}