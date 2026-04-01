'use client'
// apps/web/src/components/projects/ProvisioningBadge.tsx

"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProvisioningStatus =
  | "provisioned"
  | "provisioning"
  | "failed"
  | "pending";

export interface ProvisioningBadgeProps {
  /** Current provisioning status of the project */
  status: ProvisioningStatus;
  /** Project ID — required when showing the retry button */
  projectId?: string;
  /** Called after a successful retry request is dispatched */
  onRetrySuccess?: () => void;
  /** Called if the retry request fails */
  onRetryError?: (error: Error) => void;
  /** Suppress the retry button even when status === 'failed' */
  hideRetry?: boolean;
  /** Extra class names forwarded to the wrapper element */
  className?: string;
  /** Render a compact (icon-only) variant — useful inside tight card headers */
  compact?: boolean;
}

// ─── Status Config ────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  /** Tailwind classes for the pill wrapper */
  pillClasses: string;
  /** Tailwind classes for the dot/spinner element */
  indicatorClasses: string;
  /** Accessible description for screen-readers */
  ariaDescription: string;
  icon: React.ReactNode;
}

const STATUS_CONFIG: Record<ProvisioningStatus, StatusConfig> = {
  provisioned: {
    label: "Isolated",
    pillClasses:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    indicatorClasses: "text-emerald-500 dark:text-emerald-400",
    ariaDescription: "Project infrastructure is isolated and fully provisioned.",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  provisioning: {
    label: "Setting up...",
    pillClasses:
      "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    indicatorClasses: "text-amber-500 dark:text-amber-400",
    ariaDescription:
      "Project infrastructure is currently being provisioned. This may take a minute.",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        className="h-3.5 w-3.5 animate-spin"
      >
        <path
          strokeLinecap="round"
          d="M10 3a7 7 0 100 14A7 7 0 0010 3z"
          strokeOpacity={0.25}
        />
        <path strokeLinecap="round" d="M10 3a7 7 0 016.928 8" />
      </svg>
    ),
  },
  failed: {
    label: "Setup failed",
    pillClasses:
      "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
    indicatorClasses: "text-red-500 dark:text-red-400",
    ariaDescription:
      "Project infrastructure setup failed. Retry to attempt provisioning again.",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  pending: {
    label: "Pending setup",
    pillClasses:
      "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    indicatorClasses: "text-slate-400 dark:text-slate-500",
    ariaDescription: "Project infrastructure setup has not started yet.",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

// ─── Retry Hook ───────────────────────────────────────────────────────────────

interface UseRetryProvisioningResult {
  isRetrying: boolean;
  retryError: string | null;
  triggerRetry: () => Promise<void>;
}

function useRetryProvisioning(
  projectId: string | undefined,
  onSuccess?: () => void,
  onError?: (error: Error) => void
): UseRetryProvisioningResult {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const triggerRetry = async () => {
    if (!projectId) {
      console.warn("[ProvisioningBadge] triggerRetry called without projectId");
      return;
    }

    setIsRetrying(true);
    setRetryError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        let message = `Retry request failed with status ${response.status}`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setRetryError(error.message);
      onError?.(error);
    } finally {
      setIsRetrying(false);
    }
  };

  return { isRetrying, retryError, triggerRetry };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProvisioningBadge({
  status,
  projectId,
  onRetrySuccess,
  onRetryError,
  hideRetry = false,
  className,
  compact = false,
}: ProvisioningBadgeProps) {
  const config = STATUS_CONFIG[status];
  const showRetry = status === "failed" && !hideRetry && projectId;

  const { isRetrying, retryError, triggerRetry } = useRetryProvisioning(
    projectId,
    onRetrySuccess,
    onRetryError
  );

  return (
    <div
      className={cn("flex flex-col items-start gap-1.5", className)}
      role="status"
      aria-label={config.ariaDescription}
    >
      {/* ── Status pill ─────────────────────────────────────────────────── */}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium leading-none",
          config.pillClasses
        )}
      >
        <span className={config.indicatorClasses}>{config.icon}</span>
        {!compact && <span>{config.label}</span>}
      </span>

      {/* ── Retry button — shown only for failed status ──────────────────── */}
      {showRetry && (
        <button
          type="button"
          disabled={isRetrying}
          onClick={triggerRetry}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
            "bg-red-100 text-red-700 hover:bg-red-200",
            "dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/60",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
          aria-label="Retry infrastructure provisioning for this project"
        >
          {isRetrying ? (
            <>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                className="h-3 w-3 animate-spin"
              >
                <path
                  strokeLinecap="round"
                  d="M10 3a7 7 0 100 14A7 7 0 0010 3z"
                  strokeOpacity={0.25}
                />
                <path strokeLinecap="round" d="M10 3a7 7 0 016.928 8" />
              </svg>
              Retrying…
            </>
          ) : (
            <>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3 w-3"
              >
                <path
                  fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                  clipRule="evenodd"
                />
              </svg>
              Retry — Setup failed
            </>
          )}
        </button>
      )}

      {/* ── Inline error message ──────────────────────────────────────────── */}
      {retryError && (
        <p
          role="alert"
          className="text-xs text-red-600 dark:text-red-400"
          aria-live="assertive"
        >
          {retryError}
        </p>
      )}
    </div>
  );
}

// ─── Skeleton / Loading State ─────────────────────────────────────────────────

export function ProvisioningBadgeSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700",
        className
      )}
    />
  );
}

export default ProvisioningBadge;