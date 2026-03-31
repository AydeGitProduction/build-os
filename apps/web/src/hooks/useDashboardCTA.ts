// src/hooks/useDashboardCTA.ts

import { useMemo } from 'react';
import { Project, Phase, Blueprint } from '@/types';

export type CTAVariant = 'continue-phase' | 'open-wizard' | 'start-building';

export interface DashboardCTAConfig {
  variant: CTAVariant;
  label: string;
  href: string;
  description: string;
  statusLabel: string;
  statusColor: 'blue' | 'green' | 'amber' | 'gray';
  icon: string;
}

interface UseDashboardCTAOptions {
  project: Project;
  phases?: Phase[];
  blueprint?: Blueprint | null;
}

export function useDashboardCTA({
  project,
  phases = [],
  blueprint = null,
}: UseDashboardCTAOptions): DashboardCTAConfig {
  return useMemo(() => {
    const baseUrl = `/projects/${project.id}/wizard`;

    // Find the first active/in-progress phase
    const activePhase = phases.find(
      (p) =>
        p.status === 'active' ||
        p.status === 'in_progress' ||
        p.status === 'started'
    );

    // Continue active phase
    if (activePhase) {
      return {
        variant: 'continue-phase',
        label: `Continue Phase ${activePhase.order ?? activePhase.number ?? ''} →`,
        href: `${baseUrl}?phase=${activePhase.id}`,
        description: `Resume "${activePhase.title}" — ${activePhase.completionPercentage ?? 0}% complete`,
        statusLabel: 'Phase In Progress',
        statusColor: 'blue',
        icon: 'lightning',
      };
    }

    // Has blueprint but no active phase
    if (blueprint) {
      return {
        variant: 'open-wizard',
        label: 'Open Power Wizard →',
        href: `${baseUrl}`,
        description: `Your blueprint is ready. Launch the Power Wizard to begin building.`,
        statusLabel: 'Blueprint Ready',
        statusColor: 'green',
        icon: 'wand',
      };
    }

    // No blueprint, no phases
    return {
      variant: 'start-building',
      label: 'Start Building →',
      href: `${baseUrl}`,
      description: `Define your project blueprint and kick off your first build phase.`,
      statusLabel: 'Not Started',
      statusColor: 'gray',
      icon: 'rocket',
    };
  }, [project.id, phases, blueprint]);
}