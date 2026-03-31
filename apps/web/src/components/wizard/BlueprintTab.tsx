// apps/web/src/components/wizard/BlueprintTab.tsx

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Layers, GitBranch, Code, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlueprintEpic {
  id: string;
  title: string;
  description?: string;
  order?: number;
}

interface BlueprintPhase {
  id: string;
  title: string;
  description?: string;
  order?: number;
  epics?: BlueprintEpic[];
}

interface Blueprint {
  id: string;
  projectId: string;
  title?: string;
  description?: string;
  techStack?: string[];
  phases?: BlueprintPhase[];
  epics?: BlueprintEpic[];
  createdAt?: string;
  updatedAt?: string;
  rawContent?: string;
  [key: string]: unknown;
}

interface BlueprintTabProps {
  projectId: string;
}

// ─── Helper: count epics across all phases ───────────────────────────────────

function countEpics(bp: Blueprint): number {
  if (bp.phases && bp.phases.length > 0) {
    const fromPhases = bp.phases.reduce(
      (acc, phase) => acc + (phase.epics?.length ?? 0),
      0
    );
    if (fromPhases > 0) return fromPhases;
  }
  return bp.epics?.length ?? 0;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

const BlueprintSkeleton: React.FC = () => (
  <div className="p-4 space-y-3">
    <div className="h-6 w-3/5 bg-zinc-800 rounded animate-pulse" />
    <div className="h-4 w-11/12 bg-zinc-800 rounded animate-pulse" />
    <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
    <div className="flex gap-2 mt-4">
      {[80, 100, 70, 90].map((w, i) => (
        <div key={i} className="h-6 bg-zinc-800 rounded-full animate-pulse" style={{ width: w }} />
      ))}
    </div>
    <div className="flex gap-2 mt-4">
      <div className="flex-1 h-16 bg-zinc-800 rounded-lg animate-pulse" />
      <div className="flex-1 h-16 bg-zinc-800 rounded-lg animate-pulse" />
    </div>
    <div className="h-9 bg-zinc-800 rounded-lg animate-pulse mt-2" />
  </div>
);

// ─── Empty State ─────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
    <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
      <Sparkles className="w-7 h-7 text-zinc-500" />
    </div>
    <p className="text-zinc-300 font-semibold text-sm">No blueprint yet</p>
    <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
      Chat with IRIS to generate one. Your project blueprint will appear here once it&apos;s ready.
    </p>
  </div>
);

// ─── Full Blueprint Content ───────────────────────────────────────────────────

const FullBlueprintContent: React.FC<{ bp: Blueprint }> = ({ bp }) => {
  const phases = bp.phases ?? [];

  if (phases.length === 0 && bp.rawContent) {
    return (
      <pre className="mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-words">
        {bp.rawContent}
      </pre>
    );
  }

  if (phases.length === 0) {
    return (
      <pre className="mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-words">
        {JSON.stringify(bp, null, 2)}
      </pre>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {phases.map((phase, phaseIdx) => (
        <div key={phase.id ?? phaseIdx}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-brand-400 border border-brand-600 rounded-full px-2 py-0.5">
              Phase {phase.order ?? phaseIdx + 1}
            </span>
            <span className="text-sm font-semibold text-zinc-100">{phase.title}</span>
          </div>
          {phase.description && (
            <p className="text-xs text-zinc-500 mb-1 pl-1">{phase.description}</p>
          )}
          {phase.epics && phase.epics.length > 0 && (
            <div className="pl-3 space-y-1">
              {phase.epics.map((epic, epicIdx) => (
                <div
                  key={epic.id ?? epicIdx}
                  className="py-1.5 px-3 border-l-2 border-brand-500 bg-zinc-800/50 rounded-r"
                >
                  <p className="text-xs font-semibold text-zinc-200">{epic.title}</p>
                  {epic.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{epic.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {phaseIdx < phases.length - 1 && (
            <div className="mt-3 border-t border-zinc-800" />
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const BlueprintTab: React.FC<BlueprintTabProps> = ({ projectId }) => {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchBlueprint = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      // CRITICAL: P9C-DEBUG envelope unwrap
      // apiGet<T> unwraps one layer → { data: Blueprint | null }
      // Access .data again to reach the Blueprint object
      const r = await apiGet<{ data: Blueprint | null }>(
        `/api/projects/${projectId}/blueprint`
      );
      const bp = r.data?.data ?? null;
      setBlueprint(bp);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load blueprint';
      setError(message);
      setBlueprint(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBlueprint();
  }, [fetchBlueprint]);

  if (loading) return <BlueprintSkeleton />;

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 p-3 bg-red-950 border border-red-800 rounded-lg text-red-200 text-sm">
          <div className="flex-1">{error}</div>
          <button
            onClick={fetchBlueprint}
            className="flex items-center gap-1 text-xs text-red-300 hover:text-red-100 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!blueprint) return <EmptyState />;

  const phaseCount = blueprint.phases?.length ?? 0;
  const epicCount = countEpics(blueprint);
  const techStack = blueprint.techStack ?? [];
  const title = blueprint.title ?? 'Untitled Blueprint';
  const description = blueprint.description ?? '';

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-bold text-zinc-100 flex-1 pr-2">{title}</h3>
        <button
          onClick={fetchBlueprint}
          aria-label="Refresh blueprint"
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {description && (
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">{description}</p>
      )}

      {/* Tech Stack */}
      {techStack.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Code className="w-3 h-3 text-brand-400" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Tech Stack</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="text-xs font-medium text-brand-300 border border-brand-700 rounded-full px-2 py-0.5"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {(phaseCount > 0 || epicCount > 0) && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <GitBranch className="w-3 h-3 text-brand-400" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Structure</span>
          </div>
          <div className="flex gap-2">
            {phaseCount > 0 && (
              <div className="flex items-center gap-2 flex-1 border border-zinc-700 rounded-lg px-3 py-2">
                <Layers className="w-4 h-4 text-brand-400 shrink-0" />
                <div>
                  <p className="text-base font-bold text-zinc-100 leading-none">{phaseCount}</p>
                  <p className="text-xs text-zinc-500">{phaseCount === 1 ? 'Phase' : 'Phases'}</p>
                </div>
              </div>
            )}
            {epicCount > 0 && (
              <div className="flex items-center gap-2 flex-1 border border-zinc-700 rounded-lg px-3 py-2">
                <GitBranch className="w-4 h-4 text-brand-400 shrink-0" />
                <div>
                  <p className="text-base font-bold text-zinc-100 leading-none">{epicCount}</p>
                  <p className="text-xs text-zinc-500">{epicCount === 1 ? 'Epic' : 'Epics'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-zinc-800 mb-3" />

      {/* Expandable Full Blueprint */}
      <div>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-xs font-semibold',
            'border border-zinc-700 rounded-lg text-zinc-300',
            'hover:border-brand-600 hover:bg-zinc-800/50 transition-colors'
          )}
        >
          {expanded ? 'Collapse blueprint' : 'View full blueprint'}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </button>

        {expanded && <FullBlueprintContent bp={blueprint} />}
      </div>
    </div>
  );
};

export default BlueprintTab;
