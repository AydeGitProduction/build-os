'use client'
// src/components/autopilot/tabs/TasksTab.tsx

import React, { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskStatus = "completed" | "in_progress" | "pending" | "failed";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  phaseId: string;
  createdAt?: string;
  completedAt?: string;
}

// ─── Mock data — replace with real hook/query ─────────────────────────────

const MOCK_TASKS: Task[] = [
  {
    id: "t1",
    title: "Scaffold project structure",
    description: "Create directory layout and base config files",
    status: "completed",
    phaseId: "phase-1",
    completedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "t2",
    title: "Install dependencies",
    description: "Run npm install and resolve peer dependency conflicts",
    status: "completed",
    phaseId: "phase-1",
    completedAt: "2024-01-15T10:05:00Z",
  },
  {
    id: "t3",
    title: "Configure Tailwind CSS",
    description: "Set up tailwind.config.ts with design tokens",
    status: "in_progress",
    phaseId: "phase-2",
  },
  {
    id: "t4",
    title: "Build component library",
    description: "Create reusable UI primitives",
    status: "pending",
    phaseId: "phase-2",
  },
  {
    id: "t5",
    title: "Implement routing",
    description: "Set up Next.js App Router with layouts",
    status: "pending",
    phaseId: "phase-3",
  },
  {
    id: "t6",
    title: "Connect API endpoints",
    description: "Wire up REST/GraphQL data fetching",
    status: "failed",
    phaseId: "phase-3",
  },
];

// ─── Status Config ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; Icon: React.FC<{ className?: string }>; colorClass: string; bgClass: string }
> = {
  completed:   { label: "Done",        Icon: CheckCircle2, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" },
  in_progress: { label: "In progress", Icon: Loader2,      colorClass: "text-blue-500",    bgClass: "bg-blue-500/10"    },
  pending:     { label: "Pending",     Icon: Circle,       colorClass: "text-muted-foreground", bgClass: "bg-muted/30"  },
  failed:      { label: "Failed",      Icon: AlertCircle,  colorClass: "text-destructive",  bgClass: "bg-destructive/10" },
};

// ─── Props ────────────────────────────────────────────────────────────────

export interface TasksTabProps {
  selectedPhaseId?: string | null;
  tasks?: Task[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export const TasksTab: React.FC<TasksTabProps> = ({
  selectedPhaseId = null,
  tasks = MOCK_TASKS,
}) => {
  const filtered = useMemo(
    () =>
      selectedPhaseId
        ? tasks.filter((t) => t.phaseId === selectedPhaseId)
        : tasks,
    [tasks, selectedPhaseId]
  );

  const stats = useMemo(() => {
    const total     = filtered.length;
    const completed = filtered.filter((t) => t.status === "completed").length;
    const failed    = filtered.filter((t) => t.status === "failed").length;
    const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, failed, pct };
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      {/* Header / progress */}
      <div className="px-4 py-3 border-b border-border bg-muted/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {selectedPhaseId ? `Phase: ${selectedPhaseId}` : "All Tasks"}
          </span>
          <span className="text-xs text-muted-foreground">
            {stats.completed}/{stats.total} completed
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        {stats.failed > 0 && (
          <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {stats.failed} task{stats.failed > 1 ? "s" : ""} failed
          </p>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/50">
        {filtered.length === 0 ? (
          <EmptyState message="No tasks for this phase." />
        ) : (
          filtered.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
};

// ─── TaskRow ─────────────────────────────────────────────────────────────────

const TaskRow: React.FC<{ task: Task }> = ({ task }) => {
  const [expanded, setExpanded] = React.useState(false);
  const { Icon, colorClass, bgClass, label } = STATUS_CONFIG[task.status];

  return (
    <div className="group">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Status icon */}
        <span className={cn("mt-0.5 shrink-0 p-1 rounded-full", bgClass)}>
          <Icon
            className={cn(
              "w-3.5 h-3.5",
              colorClass,
              task.status === "in_progress" && "animate-spin"
            )}
          />
        </span>

        {/* Title + description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate">{task.description}</p>
          )}
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "hidden group-hover:inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
            bgClass,
            colorClass
          )}
        >
          {label}
        </span>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Expanded detail */}
      {expanded && task.description && (
        <div className="px-4 pb-3 ml-10">
          <div className="rounded-md bg-muted/30 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
            <p>{task.description}</p>
            {task.completedAt && (
              <p className="text-[10px] text-muted-foreground/70">
                Completed: {new Date(task.completedAt).toLocaleString()}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/70">Phase: {task.phaseId}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── EmptyState ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
    <Clock className="w-8 h-8 opacity-30" />
    <p className="text-sm">{message}</p>
  </div>
);