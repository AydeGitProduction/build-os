// src/components/dashboard/CommandCenterOverview.tsx

'use client';

import React from 'react';
import { DashboardCTAContainer } from '@/components/dashboard/DashboardCTAContainer';
import { DashboardCTABannerSkeleton } from '@/components/dashboard/DashboardCTABannerSkeleton';
import { useProject } from '@/hooks/useProject';
import { useProjectPhases } from '@/hooks/useProjectPhases';
import { useProjectBlueprint } from '@/hooks/useProjectBlueprint';
import type { Project, Phase } from '@/types';

interface CommandCenterOverviewProps {
  projectId: string;
}

// ─── Stat Cards Grid ─────────────────────────────────────────────────────────

function StatCardsGrid({
  project,
  phases,
  isLoading,
}: {
  project: Project | null;
  phases: Phase[] | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const completedPhases = phases?.filter((p) => p.status === 'completed').length ?? 0;
  const totalPhases = phases?.length ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3">
        <p className="text-xs text-zinc-500 mb-1">Status</p>
        <p className="text-sm font-semibold text-zinc-200 capitalize">{project?.status ?? '—'}</p>
      </div>
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3">
        <p className="text-xs text-zinc-500 mb-1">Phases</p>
        <p className="text-sm font-semibold text-zinc-200">
          {completedPhases}/{totalPhases}
        </p>
      </div>
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 hidden sm:block">
        <p className="text-xs text-zinc-500 mb-1">Project</p>
        <p className="text-sm font-semibold text-zinc-200 truncate">{project?.name ?? '—'}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
    </div>
  );
}