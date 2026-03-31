// apps/web/src/components/wizard/TasksTab.tsx

"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Zap,
  Send,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Ban,
  PlayCircle,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus =
  | "in_progress"
  | "ready"
  | "dispatched"
  | "completed"
  | "blocked"
  | "pending"
  | "failed"
  | "cancelled";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  agent_role?: string | null;
  updated_at: string;
  created_at: string;
  blocked_reason?: string | null;
  project_id: string;
}

interface TasksTabProps {
  projectId: string;
  /** Optional: poll interval in ms. Default 30000 (30s). Set 0 to disable. */
  pollInterval?: number;
}

// ─── Status Metadata ──────────────────────────────────────────────────────────

const STATUS_META: Record<
  TaskStatus,
  {
    label: string;
    icon: React.ElementType;
    iconClass: string;
    badgeClass: string;
  }
> = {
  in_progress: {
    label: "In Progress",
    icon: Loader2,
    iconClass: "text-blue-500 animate-spin",
    badgeClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  ready: {
    label: "Ready",
    icon: PlayCircle,
    iconClass: "text-emerald-500",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  dispatched: {
    label: "Dispatched",
    icon: Send,
    iconClass: "text-violet-500",
    badgeClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    iconClass: "text-green-500",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  blocked: {
    label: "Blocked",
    icon: Ban,
    iconClass: "text-red-500",
    badgeClass:
      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    iconClass: "text-amber-500",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    iconClass: "text-red-600",
    badgeClass:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
  cancelled: {
    label: "Cancelled",
    icon: Circle,
    iconClass: "text-gray-400",
    badgeClass:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

const ACTIVE_STATUSES: TaskStatus[] = ["in_progress", "ready", "dispatched"];
const COMPLETED_STATUS: TaskStatus = "completed";
const BLOCKED_STATUS: TaskStatus = "blocked";
const SECONDARY_STATUSES: TaskStatus[] = ["pending", "failed", "cancelled"];

const MAX_COMPLETED_SHOWN = 20;

// ─── Utilities ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

function truncateTitle(title: string, max = 60): string {
  if (!title) return "(untitled)";
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

function formatAgentRole(role?: string | null): string {
  if (!role) return "Unassigned";
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusIcon = ({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) => {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <Icon
      className={cn("h-4 w-4 shrink-0", meta.iconClass, className)}
      aria-label={meta.label}
    />
  );
};

const AgentBadge = ({ role }: { role?: string | null }) => {
  const label = formatAgentRole(role);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        "border border-slate-200 dark:border-slate-700"
      )}
    >
      {label}
    </span>
  );
};

const TaskRow = ({ task }: { task: Task }) => {
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  return (
    <div
      className={cn(
        "group flex flex-col gap-1 rounded-md px-3 py-2.5",
        "hover:bg-muted/60 transition-colors duration-100",
        "border border-transparent hover:border-border"
      )}
      role="listitem"
    >
      <div className="flex items-start gap-2.5">
        {/* Status icon */}
        <div className="mt-0.5">
          <StatusIcon status={task.status} />
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-medium leading-tight text-foreground"
            title={task.title}
          >
            {truncateTitle(task.title)}
          </p>

          {/* Blocked reason */}
          {task.status === "blocked" && task.blocked_reason && (
            <p className="mt-0.5 text-xs text-red-500 dark:text-red-400 leading-snug">
              ↳ {task.blocked_reason}
            </p>
          )}

          {/* Failed reason / secondary info */}
          {task.status === "failed" && task.blocked_reason && (
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 leading-snug">
              ↳ {task.blocked_reason}
            </p>
          )}
        </div>

        {/* Right: badge + time */}
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <AgentBadge role={task.agent_role} />
          <time
            dateTime={task.updated_at}
            className="text-[10px] text-muted-foreground tabular-nums"
            title={new Date(task.updated_at).toLocaleString()}
          >
            {relativeTime(task.updated_at)}
          </time>
        </div>
      </div>
    </div>
  );
};

const TaskSkeleton = () => (
  <div className="flex items-start gap-2.5 rounded-md px-3 py-2.5">
    <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-3.5 w-3/4 rounded" />
      <Skeleton className="h-3 w-1/3 rounded" />
    </div>
    <div className="flex flex-col items-end gap-1.5">
      <Skeleton className="h-4 w-16 rounded-full" />
      <Skeleton className="h-2.5 w-10 rounded" />
    </div>
  </div>
);

interface SectionHeaderProps {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
}

const SectionHeader = ({
  icon: Icon,
  iconClass,
  label,
  count,
  isOpen,
  onToggle,
}: SectionHeaderProps) => (
  <CollapsibleTrigger
    onClick={onToggle}
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5",
      "hover:bg-muted/50 transition-colors duration-100",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    )}
    aria-expanded={isOpen}
  >
    <Icon className={cn("h-4 w-4 shrink-0", iconClass)} />
    <span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <span className="text-xs font-medium text-muted-foreground tabular-nums">
      {count}
    </span>
    {isOpen ? (
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    ) : (
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    )}
  </CollapsibleTrigger>
);

interface TaskSectionProps {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  tasks: Task[];
  defaultOpen?: boolean;
  /** Extra info shown in the header area */
  note?: string;
}

const TaskSection = ({
  icon,
  iconClass,
  label,
  tasks,
  defaultOpen = true,
  note,
}: TaskSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  if (tasks.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <SectionHeader
            icon={icon}
            iconClass={iconClass}
            label={label}
            count={tasks.length}
            isOpen={open}
            onToggle={() => setOpen((v) => !v)}
          />
        </div>
        {note && (
          <p className="px-2 text-[10px] text-muted-foreground">{note}</p>
        )}
        <CollapsibleContent>
          <div className="mt-0.5 space-y-0.5" role="list">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// ─── Empty States ─────────────────────────────────────────────────────────────

const EmptyAllTasks = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <ListChecks className="h-10 w-10 text-muted-foreground/40" />
    <div>
      <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
      <p className="mt-1 text-xs text-muted-foreground/60">
        Tasks will appear here once the project kicks off.
      </p>
    </div>
  </div>
);

const AllCompleteState = ({ count }: { count: number }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
    <CheckCircle2 className="h-10 w-10 text-green-500" />
    <div>
      <p className="text-sm font-semibold text-foreground">All tasks complete</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {count} task{count !== 1 ? "s" : ""} completed — nothing left to do.
      </p>
    </div>
  </div>
);

// ─── Main Hook ────────────────────────────────────────────────────────────────

interface FetchState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

function useProjectTasks(projectId: string, pollInterval = 30_000) {
  const [state, setState] = useState<FetchState>({
    tasks: [],
    loading: true,
    error: null,
    lastFetched: null,
  });

  const fetchTasks = useCallback(
    async (silent = false) => {
      if (!silent) {
        setState((s) => ({ ...s, loading: true, error: null }));
      }
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/tasks?limit=50&order=updated_at.desc`,
          { credentials: "include" }
        );
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `Failed to load tasks (${res.status})${body ? `: ${body}` : ""}`
          );
        }
        const json = await res.json();
        // Support both { tasks: [] } and bare [] responses
        const raw: unknown[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.tasks)
          ? json.tasks
          : Array.isArray(json?.data)
          ? json.data
          : [];

        setState({
          tasks: raw as Task[],
          loading: false,
          error: null,
          lastFetched: Date.now(),
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error loading tasks";
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
          lastFetched: s.lastFetched,
        }));
      }
    },
    [projectId]
  );

  useEffect(() => {
    fetchTasks(false);
  }, [fetchTasks]);

  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;
    const interval = setInterval(() => fetchTasks(true), pollInterval);
    return () => clearInterval(interval);
  }, [fetchTasks, pollInterval]);

  const refresh = useCallback(() => fetchTasks(false), [fetchTasks]);

  return { ...state, refresh };
}

// ─── Grouped Tasks Logic ──────────────────────────────────────────────────────

interface GroupedTasks {
  active: Task[];
  completed: Task[];
  completedTotal: number;
  blocked: Task[];
  secondary: Task[]; // pending, failed, cancelled
  total: number;
  hasOnlyCompleted: boolean;
  isEmpty: boolean;
}

function groupTasks(tasks: Task[]): GroupedTasks {
  const active: Task[] = [];
  const completedAll: Task[] = [];
  const blocked: Task[] = [];
  const secondary: Task[] = [];

  for (const task of tasks) {
    if (ACTIVE_STATUSES.includes(task.status)) {
      active.push(task);
    } else if (task.status === COMPLETED_STATUS) {
      completedAll.push(task);
    } else if (task.status === BLOCKED_STATUS) {
      blocked.push(task);
    } else if (SECONDARY_STATUSES.includes(task.status)) {
      secondary.push(task);
    }
  }

  // Already sorted by updated_at desc from API; take first 20 completed
  const completed = completedAll.slice(0, MAX_COMPLETED_SHOWN);

  const total = tasks.length;
  const isEmpty = total === 0;
  const hasOnlyCompleted =
    !isEmpty &&
    active.length === 0 &&
    blocked.length === 0 &&
    secondary.length === 0 &&
    completedAll.length > 0;

  return {
    active,
    completed,
    completedTotal: completedAll.length,
    blocked,
    secondary,
    total,
    hasOnlyCompleted,
    isEmpty,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TasksTab({
  projectId,
  pollInterval = 30_000,
}: TasksTabProps) {
  const { tasks, loading, error, lastFetched, refresh } = useProjectTasks(
    projectId,
    pollInterval
  );

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);

  // ── Render: Loading skeleton
  if (loading && lastFetched === null) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-label="Loading tasks">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-7 w-20 rounded" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <TaskSkeleton key={i} />
        ))}
      </div>
    );
  }

  // ── Render: Error state
  if (error && lastFetched === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Failed to load tasks
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Tasks</span>
          {grouped.total > 0 && (
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
              {grouped.total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stale / background-refresh indicator */}
          {error && lastFetched !== null && (
            <span className="text-[10px] text-amber-500" title={error}>
              ⚠ stale
            </span>
          )}
          {loading && lastFetched !== null && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh tasks"
          >
            <RefreshCw
              className={cn("h-3 w-3", loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Last fetched timestamp */}
      {lastFetched !== null && (
        <div className="border-b bg-muted/20 px-4 py-1 text-[10px] text-muted-foreground shrink-0">
          Updated {relativeTime(new Date(lastFetched).toISOString())}
          {grouped.total > 0 && (
            <span className="ml-2">
              · {grouped.active.length} active · {grouped.completedTotal} completed
              {grouped.blocked.length > 0 &&
                ` · ${grouped.blocked.length} blocked`}
            </span>
          )}
        </div>
      )}

      {/* ── Content */}
      <div className="flex-1 overflow-y-auto">
        {grouped.isEmpty ? (
          <EmptyAllTasks />
        ) : grouped.hasOnlyCompleted ? (
          <div className="space-y-1 p-4">
            <AllCompleteState count={grouped.completedTotal} />
            {/* Still render completed section below the celebration */}
            <TaskSection
              icon={CheckCircle2}
              iconClass="text-green-500"
              label={
                grouped.completedTotal > MAX_COMPLETED_SHOWN
                  ? `Recently Completed (last ${MAX_COMPLETED_SHOWN} of ${grouped.completedTotal})`
                  : "Completed"
              }
              tasks={grouped.completed}
              defaultOpen={false}
              note={
                grouped.completedTotal > MAX_COMPLETED_SHOWN
                  ? `Showing ${MAX_COMPLETED_SHOWN} most-recently-updated. ${
                      grouped.completedTotal - MAX_COMPLETED_SHOWN
                    } older tasks not shown.`
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {/* 1. Active Tasks */}
            <TaskSection
              icon={Zap}
              iconClass="text-blue-500"
              label="Active"
              tasks={grouped.active}
              defaultOpen
            />

            {/* 2. Blocked Tasks */}
            <TaskSection
              icon={Ban}
              iconClass="text-red-500"
              label="Blocked"
              tasks={grouped.blocked}
              defaultOpen
            />

            {/* 3. Secondary (pending, failed, cancelled) */}
            <TaskSection
              icon={Clock}
              iconClass="text-amber-500"
              label="Other"
              tasks={grouped.secondary}
              defaultOpen={false}
            />

            {/* 4. Completed (recent 20) */}
            {grouped.completed.length > 0 && (
              <TaskSection
                icon={CheckCircle2}
                iconClass="text-green-500"
                label={
                  grouped.completedTotal > MAX_COMPLETED_SHOWN
                    ? `Recently Completed (last ${MAX_COMPLETED_SHOWN} of ${grouped.completedTotal})`
                    : `Completed`
                }
                tasks={grouped.completed}
                defaultOpen={false}
                note={
                  grouped.completedTotal > MAX_COMPLETED_SHOWN
                    ? `Showing ${MAX_COMPLETED_SHOWN} most recently updated. ${
                        grouped.completedTotal - MAX_COMPLETED_SHOWN
                      } older task${
                        grouped.completedTotal - MAX_COMPLETED_SHOWN !== 1
                          ? "s"
                          : ""
                      } not shown.`
                    : undefined
                }
              />
            )}

            {/* Empty active state — only when we have data but no active tasks */}
            {grouped.active.length === 0 &&
              grouped.blocked.length === 0 &&
              grouped.completedTotal > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    No tasks currently in progress.{" "}
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {grouped.completedTotal} task
                      {grouped.completedTotal !== 1 ? "s" : ""} completed.
                    </span>
                  </p>
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Footer: summary stats */}
      {!grouped.isEmpty && (
        <div className="shrink-0 border-t bg-muted/20 px-4 py-2">
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <StatPill
              icon={Zap}
              iconClass="text-blue-500"
              label="Active"
              count={grouped.active.length}
            />
            <StatPill
              icon={CheckCircle2}
              iconClass="text-green-500"
              label="Done"
              count={grouped.completedTotal}
            />
            {grouped.blocked.length > 0 && (
              <StatPill
                icon={Ban}
                iconClass="text-red-500"
                label="Blocked"
                count={grouped.blocked.length}
              />
            )}
            {grouped.secondary.length > 0 && (
              <StatPill
                icon={Clock}
                iconClass="text-amber-500"
                label="Other"
                count={grouped.secondary.length}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat Pill ─────────────────────────────────────────────────────────────────

const StatPill = ({
  icon: Icon,
  iconClass,
  label,
  count,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  count: number;
}) => (
  <span className="flex items-center gap-1">
    <Icon className={cn("h-3 w-3", iconClass)} />
    <span className="font-medium tabular-nums">{count}</span>
    <span>{label}</span>
  </span>
);

// ─── Default export ────────────────────────────────────────────────────────────

export default TasksTab;