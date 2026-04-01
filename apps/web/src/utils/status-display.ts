// src/utils/status-display.ts

/**
 * Canonical status vocabulary for the entire application.
 * All components must use these exact values.
 */
export type ProjectStatus = 'planning' | 'running' | 'blocked' | 'done';
export type PhaseStatus = 'planning' | 'running' | 'blocked' | 'done';
export type TaskStatus = 'planning' | 'running' | 'blocked' | 'done';

/** Union covering all entity status types */
export type AppStatus = ProjectStatus | PhaseStatus | TaskStatus;

/**
 * Normalizes any legacy or non-standard status string into a canonical AppStatus.
 * Logs a warning if an unknown value is encountered.
 */
export function normalizeStatus(raw: string | undefined | null): AppStatus {
  if (!raw) return 'planning';

  const lower = raw.trim().toLowerCase();

  const mapping: Record<string, AppStatus> = {
    // Canonical values
    planning: 'planning',
    running: 'running',
    blocked: 'blocked',
    done: 'done',

    // Legacy / non-standard synonyms → canonical
    active: 'running',
    'in-progress': 'running',
    'in progress': 'running',
    inprogress: 'running',
    started: 'running',
    ongoing: 'running',
    current: 'running',
    open: 'running',

    complete: 'done',
    completed: 'done',
    finished: 'done',
    closed: 'done',
    resolved: 'done',
    archived: 'done',

    draft: 'planning',
    pending: 'planning',
    todo: 'planning',
    'to-do': 'planning',
    'not started': 'planning',
    new: 'planning',
    queued: 'planning',
    backlog: 'planning',

    stuck: 'blocked',
    halted: 'blocked',
    paused: 'blocked',
    waiting: 'blocked',
    'on hold': 'blocked',
    onhold: 'blocked',
    failed: 'blocked',
  };

  if (mapping[lower] !== undefined) {
    return mapping[lower];
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[status-display] Unknown status value "${raw}" — defaulting to "planning". ` +
        `Add it to the normalizeStatus mapping if intentional.`
    );
  }

  return 'planning';
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusDisplay {
  /** Human-readable label shown in the UI */
  label: string;
  /** Tailwind classes for the badge container */
  badgeClasses: string;
  /** Tailwind classes for the dot / indicator */
  dotClasses: string;
  /** Whether to render the animated pulse ring */
  pulse: boolean;
  /** Tailwind text color class (useful outside badges) */
  textClass: string;
  /** Tailwind border color class */
  borderClass: string;
  /** Accessible description for screen readers */
  ariaLabel: string;
}

const STATUS_CONFIG: Record<AppStatus, StatusDisplay> = {
  running: {
    label: 'Running',
    badgeClasses:
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
      'bg-green-100 text-green-800 ring-1 ring-inset ring-green-600/20 ' +
      'dark:bg-green-900/30 dark:text-green-300 dark:ring-green-500/30',
    dotClasses: 'h-1.5 w-1.5 rounded-full bg-green-500',
    pulse: true,
    textClass: 'text-green-700 dark:text-green-400',
    borderClass: 'border-green-500',
    ariaLabel: 'Status: Running',
  },

  blocked: {
    label: 'Blocked',
    badgeClasses:
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
      'bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20 ' +
      'dark:bg-red-900/30 dark:text-red-300 dark:ring-red-500/30',
    dotClasses: 'h-1.5 w-1.5 rounded-full bg-red-500',
    pulse: false,
    textClass: 'text-red-700 dark:text-red-400',
    borderClass: 'border-red-500',
    ariaLabel: 'Status: Blocked',
  },

  done: {
    label: 'Done',
    badgeClasses:
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
      'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-600/20 ' +
      'dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-500/30',
    dotClasses: 'h-1.5 w-1.5 rounded-full bg-emerald-500',
    pulse: false,
    textClass: 'text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-500',
    ariaLabel: 'Status: Done',
  },

  planning: {
    label: 'Planning',
    badgeClasses:
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
      'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-600/20 ' +
      'dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-500/30',
    dotClasses: 'h-1.5 w-1.5 rounded-full bg-violet-500',
    pulse: false,
    textClass: 'text-violet-700 dark:text-violet-400',
    borderClass: 'border-violet-500',
    ariaLabel: 'Status: Planning',
  },
};

/**
 * Returns the full visual configuration for a given status value.
 * Automatically normalizes non-canonical strings.
 */
export function getStatusDisplay(raw: string | undefined | null): StatusDisplay {
  const canonical = normalizeStatus(raw);
  return STATUS_CONFIG[canonical];
}

/**
 * Returns just the badge CSS classes for a status value.
 * Convenience wrapper for inline usage.
 */
export function getStatusBadgeClasses(raw: string | undefined | null): string {
  return getStatusDisplay(raw).badgeClasses;
}

/**
 * Returns the canonical label string for a status value.
 */
export function getStatusLabel(raw: string | undefined | null): string {
  return getStatusDisplay(raw).label;
}

/**
 * Ordered list of all canonical statuses — useful for dropdowns / filters.
 */
export const ALL_STATUSES: AppStatus[] = ['planning', 'running', 'blocked', 'done'];

/**
 * Returns display config for all statuses (e.g. for rendering a legend).
 */
export function getAllStatusDisplays(): Array<{ status: AppStatus } & StatusDisplay> {
  return ALL_STATUSES.map((s) => ({ status: s, ...STATUS_CONFIG[s] }));
}