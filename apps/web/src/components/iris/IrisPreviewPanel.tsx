// apps/web/src/components/iris/IrisPreviewPanel.tsx
"use client";

import React from "react";
import type { IrisPreviewData } from "@/types/iris";
import { cn } from "@/lib/utils";

interface IrisPreviewPanelProps {
  data: IrisPreviewData | null;
  isLoading?: boolean;
  className?: string;
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function PreviewEmptyState() {
  return (
    <div className="iris-preview-panel__empty flex flex-col items-center justify-center flex-1 px-8 py-12 text-center">
      {/* Dashed circle */}
      <div
        className="iris-preview-panel__empty-icon w-20 h-20 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        <span className="text-2xl opacity-40">◎</span>
      </div>

      <p className="iris-preview-panel__empty-heading text-sm font-medium text-foreground/60 mb-1">
        Blueprint preview
      </p>
      <p className="iris-preview-panel__empty-body text-xs text-muted-foreground max-w-[200px]">
        Start chatting with IRIS to see your project blueprint take shape here.
      </p>
    </div>
  );
}

// ─── Partial banner ───────────────────────────────────────────────────────────
function PartialBanner() {
  return (
    <div
      className="iris-preview-panel__partial-banner flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400"
      role="status"
      aria-live="polite"
    >
      <span className="iris-preview-panel__partial-icon text-xs" aria-hidden="true">
        ◑
      </span>
      <span className="iris-preview-panel__partial-text text-xs font-medium">
        Blueprint preview — discovery in progress
      </span>
    </div>
  );
}

// ─── Phase card ───────────────────────────────────────────────────────────────
interface PhaseCardProps {
  phase: IrisPreviewData["phases"][number];
  index: number;
}

function PhaseCard({ phase, index }: PhaseCardProps) {
  return (
    <div className="iris-preview-panel__phase-card rounded-lg border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="iris-preview-panel__phase-number text-xs font-mono text-muted-foreground w-5 text-center">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="iris-preview-panel__phase-name text-sm font-semibold text-foreground truncate">
          {phase.name}
        </span>
      </div>

      {phase.tasks && phase.tasks.length > 0 && (
        <p className="iris-preview-panel__phase-task-count text-xs text-muted-foreground pl-7">
          {phase.tasks.length} task{phase.tasks.length !== 1 ? "s" : ""}
        </p>
      )}

      {phase.description && (
        <p className="iris-preview-panel__phase-description text-xs text-muted-foreground pl-7 line-clamp-2">
          {phase.description}
        </p>
      )}
    </div>
  );
}

// ─── Assumptions list ─────────────────────────────────────────────────────────
interface AssumptionsProps {
  assumptions: string[];
}

function AssumptionsList({ assumptions }: AssumptionsProps) {
  if (!assumptions || assumptions.length === 0) return null;

  return (
    <div className="iris-preview-panel__assumptions space-y-1.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Key Assumptions
      </h3>
      <ul className="space-y-1">
        {assumptions.map((assumption, i) => (
          <li
            key={i}
            className="iris-preview-panel__assumption-item flex items-start gap-2 text-xs text-foreground/80"
          >
            <span className="mt-0.5 text-muted-foreground/60 shrink-0" aria-hidden="true">
              ·
            </span>
            <span>{assumption}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function PreviewSkeleton() {
  return (
    <div className="iris-preview-panel__skeleton space-y-3 p-4" aria-hidden="true">
      <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
      <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
      <div className="space-y-2 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function IrisPreviewPanel({
  data,
  isLoading = false,
  className,
}: IrisPreviewPanelProps) {
  // ── Panel header (always shown) ─────────────────────────────────────────
  const header = (
    <div className="iris-preview-panel__header flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Blueprint Preview</span>
        {isLoading && (
          <span
            className="iris-preview-panel__loading-dot w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"
            aria-label="Updating preview"
          />
        )}
      </div>

      {data && (
        <span className="iris-preview-panel__phase-count text-xs text-muted-foreground">
          {data.phases?.length ?? 0} phase{(data.phases?.length ?? 0) !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div
        className={cn(
          "iris-preview-panel flex flex-col h-full bg-background",
          className
        )}
        data-testid="iris-preview-panel"
        data-state="empty"
      >
        {header}
        <PreviewEmptyState />
      </div>
    );
  }

  // ── Populated state ─────────────────────────────────────────────────────
  const {
    product_name,
    problem_statement,
    target_audience,
    phases = [],
    assumptions = [],
    is_partial,
  } = data;

  return (
    <div
      className={cn(
        "iris-preview-panel flex flex-col h-full bg-background",
        className
      )}
      data-testid="iris-preview-panel"
      data-state={is_partial ? "partial" : "complete"}
    >
      {header}

      {/* Partial-discovery banner */}
      {is_partial && <PartialBanner />}

      {/* Scrollable content */}
      <div className="iris-preview-panel__content flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Product identity */}
        {(product_name || problem_statement || target_audience) && (
          <section className="iris-preview-panel__identity space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Product
            </h3>

            {product_name && (
              <div className="iris-preview-panel__product-name">
                <p className="text-base font-bold text-foreground">{product_name}</p>
              </div>
            )}

            {problem_statement && (
              <div className="iris-preview-panel__problem space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">Solves</p>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {problem_statement}
                </p>
              </div>
            )}

            {target_audience && (
              <div className="iris-preview-panel__audience space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">For</p>
                <p className="text-xs text-foreground/80">{target_audience}</p>
              </div>
            )}
          </section>
        )}

        {/* Phases */}
        {phases.length > 0 && (
          <section className="iris-preview-panel__phases space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Phases
            </h3>
            <div className="space-y-2">
              {phases.map((phase, index) => (
                <PhaseCard key={phase.id ?? index} phase={phase} index={index} />
              ))}
            </div>
          </section>
        )}

        {/* Assumptions */}
        {assumptions.length > 0 && (
          <section className="iris-preview-panel__assumptions-section">
            <AssumptionsList assumptions={assumptions} />
          </section>
        )}

        {/* If partial but nothing yet collected — nudge message */}
        {is_partial &&
          !product_name &&
          !problem_statement &&
          phases.length === 0 && (
            <div className="iris-preview-panel__partial-nudge text-center py-4">
              <p className="text-xs text-muted-foreground">
                IRIS is gathering information. Keep the conversation going!
              </p>
            </div>
          )}
      </div>
    </div>
  );
}