/**
 * BUILD OS — P9C Roadmap
 * Full UX System + Execution Control Center
 * Seeded via POST /api/projects/[id]/seed-p9c
 *
 * MODE: DEVELOPER-FIRST | NO SHORTCUTS | REAL IMPLEMENTATION | UX + EXECUTION INTEGRATION
 *
 * Goal: Build the full product UI layer — Dashboard Mode + Autopilot Mode —
 *       connected to real APIs with no mock data.
 *
 * 11 Workstreams:
 *   WS1  — Design System Foundation      (7 tasks)
 *   WS2  — Sidebar + Navigation          (6 tasks)
 *   WS3  — Dashboard Mode                (8 tasks)
 *   WS4  — Autopilot Mode Layout         (7 tasks)
 *   WS5  — Wizard Panel                  (7 tasks)
 *   WS6  — Live Preview                  (7 tasks)
 *   WS7  — Execution Top Bar             (8 tasks)
 *   WS8  — Log Stream                    (7 tasks)
 *   WS9  — Mode Switch                   (5 tasks)
 *   WS10 — Backend Connection            (7 tasks)
 *   WS11 — Mobile (Basic)                (6 tasks)
 *
 * Total: 1 Epic · 11 Features · 75 Tasks
 *
 * Acceptance Criteria:
 *   - Dashboard works with real data
 *   - Autopilot mode works end-to-end
 *   - Wizard panel uses real chat + AI state
 *   - Live preview shows real output
 *   - Log stream shows real-time logs
 *   - Zero mock data anywhere
 */

import type { RoadmapEpic } from './build-os-roadmap'

export const P9C_EPIC_TITLE = 'P9C — Full UX System + Execution Control Center'

export const ROADMAP_P9C_SUMMARY = {
  epic_count:    1,
  feature_count: 11,
  task_count:    75,
  workstreams:   ['WS1', 'WS2', 'WS3', 'WS4', 'WS5', 'WS6', 'WS7', 'WS8', 'WS9', 'WS10', 'WS11'],
}

export const BUILD_OS_ROADMAP_P9C: RoadmapEpic[] = [
  {
    title: P9C_EPIC_TITLE,
    description: 'Build the full product UI layer: Design System, Dashboard Mode, Autopilot Mode, Wizard Panel, Live Preview, Execution Top Bar, Log Stream, Mode Switch — all connected to real APIs with zero mock data.',
    status: 'in_progress',
    features: [

      // ── WS1 — Design System Foundation ───────────────────────────────────────
      {
        title: 'WS1 — Design System Foundation',
        description: 'Establish the core design language: color tokens, 8px spacing grid, typography scale, border radius, elevation, and base layout primitives.',
        workstream: 'WS1',
        tasks: [
          {
            title: 'Define color token system: brand, semantic, neutral, status',
            description: 'Create apps/web/src/styles/tokens/colors.ts with full token set: brand-500/600/700, neutral-50→950, semantic (success/warning/error/info) in 3 shades each. Export as CSS variables + JS object. Target: dark-first palette consistent with execution context.',
            role: 'frontend_engineer',
            task_type: 'design',
            status: 'ready',
            priority: 'critical',
          },
          {
            title: 'Implement 8px spacing grid + typography scale',
            description: 'Create apps/web/src/styles/tokens/spacing.ts (4/8/12/16/20/24/32/40/48/64/80/96px) and typography.ts (font families: Inter/mono, sizes: xs/sm/base/lg/xl/2xl/3xl/4xl, weights: 400/500/600/700, line heights). Export as Tailwind theme extensions.',
            role: 'frontend_engineer',
            task_type: 'design',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build Card component with variants: default, elevated, bordered, glass',
            description: 'Create apps/web/src/components/ui/Card.tsx. Props: variant (default|elevated|bordered|glass), padding (sm|md|lg), className. Uses design tokens. Exports CardHeader, CardBody, CardFooter sub-components. No mock data — pure structural component.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build StatusBadge component with all task/epic statuses',
            description: 'Create apps/web/src/components/ui/StatusBadge.tsx. Variants map to all valid task statuses: pending/ready/dispatched/in_progress/awaiting_review/in_qa/blocked/failed/completed/cancelled. Each has distinct color + icon. Size variants: sm/md/lg.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build Button component with full variant/size/state system',
            description: 'Create apps/web/src/components/ui/Button.tsx. Variants: primary/secondary/ghost/danger/outline. Sizes: sm/md/lg. States: default/hover/active/disabled/loading (with spinner). Icon-left/icon-right support. Full keyboard accessibility.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build Grid/Layout system: container, row, col, stack, spacer',
            description: 'Create apps/web/src/components/layout/Grid.tsx. Components: Container (max-width + horizontal padding), Stack (flex col or row with gap), Grid (CSS grid with cols prop), Spacer (flex-1). All use 8px spacing tokens. Responsive variants via Tailwind.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Integrate design tokens into Tailwind config + global CSS',
            description: 'Update tailwind.config.ts to extend theme with all color tokens, spacing scale, typography. Update apps/web/src/app/globals.css to define CSS variables for tokens. Test: all components render correctly with token-based classes.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS2 — Sidebar + Navigation ────────────────────────────────────────────
      {
        title: 'WS2 — Sidebar + Navigation',
        description: 'Build 240px persistent sidebar with nested navigation, collapsible sections, active route highlighting, and workspace context.',
        workstream: 'WS2',
        tasks: [
          {
            title: 'Build AppSidebar shell: 240px fixed, collapse toggle, z-layer',
            description: 'Create apps/web/src/components/layout/AppSidebar.tsx. Fixed 240px width, collapses to 64px icon-only rail. CSS transition on collapse. Stores collapsed state in localStorage. Dark background (#0f1117 or token). Full height 100vh.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build nested NavItem component with icon, label, badge, active state',
            description: 'Create apps/web/src/components/layout/NavItem.tsx. Props: icon (Lucide), label, href, badge (optional), depth (0/1/2). Active state detection from usePathname(). Collapsed state shows icon + tooltip only. Handles nested children with disclosure animation.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Implement nav sections: Dashboard, Projects, Execution, Settings',
            description: 'Wire up navigation tree in AppSidebar. Sections: (1) Dashboard with Overview/Stats, (2) Projects with project switcher, (3) Execution with Autopilot/Tasks/Agents/Logs, (4) Settings with Account/Integrations. Each section collapsible independently.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build WorkspaceSelector in sidebar header',
            description: 'Create apps/web/src/components/layout/WorkspaceSelector.tsx. Shows current workspace name + avatar. Dropdown lists all workspaces from /api/workspaces. On select: update workspace context, refresh project list. Uses real API — no mock data.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build UserProfile footer in sidebar: avatar, name, sign out',
            description: 'Create apps/web/src/components/layout/SidebarUserFooter.tsx. Shows user avatar (initials fallback), full name, email truncated. Dropdown: Profile / Settings / Sign Out. Sign out calls supabase.auth.signOut() + redirect to /login.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Integrate sidebar into root layout with responsive breakpoint',
            description: 'Update apps/web/src/app/layout.tsx (or dashboard layout) to include AppSidebar. On mobile (<768px): sidebar hidden, accessible via hamburger. Desktop: always visible. Main content area adjusts margin-left based on sidebar state.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS3 — Dashboard Mode ──────────────────────────────────────────────────
      {
        title: 'WS3 — Dashboard Mode',
        description: 'Build the management view: header with project context, stats bar, active execution cards, recent logs preview, and performance metrics — all from real API data.',
        workstream: 'WS3',
        tasks: [
          {
            title: 'Build DashboardHeader: project name, status, last-run time, action buttons',
            description: 'Create apps/web/src/components/dashboard/DashboardHeader.tsx. Shows project name from /api/projects/[id], StatusBadge for project status, last run timestamp (formatted), and action buttons: Run / Pause / Settings. Connects to real project data.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build StatsBar: tasks total, completed, in-progress, blocked, agents active',
            description: 'Create apps/web/src/components/dashboard/StatsBar.tsx. 5 stat cards: total_tasks, completed, in_progress, blocked, active_agents. Data from /api/projects/[id]/tasks (count by status) and /api/orchestrate/status. Auto-refreshes every 30s.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build ExecutionCard: single task card with agent, status, duration, cost',
            description: 'Create apps/web/src/components/dashboard/ExecutionCard.tsx. Shows: task title, agent_role badge, StatusBadge, started_at relative time, estimated cost, expand for description. Click: opens task detail drawer. Handles all valid task statuses.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build ActiveExecutionsList: paginated list of in-progress + recent tasks',
            description: 'Create apps/web/src/components/dashboard/ActiveExecutionsList.tsx. Fetches /api/projects/[id]/tasks?status=in_progress,ready,dispatched. Renders ExecutionCard per task. Pagination: 20/page. Empty state: "No active executions." Polling every 15s.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build LogsPreviewPanel: last 20 log entries with level filtering',
            description: 'Create apps/web/src/components/dashboard/LogsPreviewPanel.tsx. Fetches recent logs from /api/supervisor or equivalent log endpoint. Shows timestamp, level (info/warn/error), message, agent. Level filter chips. "View all" links to full LogStream. No mock logs.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build PerformancePanel: cost chart, task throughput, error rate',
            description: 'Create apps/web/src/components/dashboard/PerformancePanel.tsx. 3 mini charts: (1) cumulative cost over time from /api/cost/event, (2) tasks completed per hour from task history, (3) error rate %. Uses recharts or similar. Falls back to "No data yet" gracefully.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Build EpicsProgressPanel: epic list with feature + task completion bars',
            description: 'Create apps/web/src/components/dashboard/EpicsProgressPanel.tsx. Shows each epic with title, status badge, and horizontal progress bar (completed_tasks / total_tasks). Data from /api/projects/[id]/tasks grouped by epic. Click epic: filter active executions.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Assemble /app/(dashboard)/page.tsx: full dashboard layout from components',
            description: 'Wire up DashboardHeader + StatsBar + (ActiveExecutionsList | LogsPreviewPanel | PerformancePanel) in a responsive 12-col grid. Top: header. Row2: 4 stats. Row3: left=executions(8col), right=logs(4col). Row4: performance + epics. All real data. No mock.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS4 — Autopilot Mode Layout ───────────────────────────────────────────
      {
        title: 'WS4 — Autopilot Mode Layout',
        description: 'Build the Autopilot Mode container: mini sidebar, split wizard (left) / preview (right) layout, top execution bar. The full execution experience.',
        workstream: 'WS4',
        tasks: [
          {
            title: 'Create /app/(autopilot)/layout.tsx: full-screen execution shell',
            description: 'Create apps/web/src/app/(autopilot)/layout.tsx. Full-screen (h-screen, overflow-hidden). No standard sidebar — uses mini execution sidebar. Structure: top ExecutionTopBar (fixed 48px) + main area (flex row: MiniSidebar 64px | WizardPanel flex-1 | PreviewPanel flex-1). No scrollbar on outer container.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build MiniSidebar: icon-only 64px rail with section shortcuts',
            description: 'Create apps/web/src/components/autopilot/MiniSidebar.tsx. 64px width, full height. Icons (Lucide) for: Wizard / Preview / Logs / Agents / Settings. Active icon highlighted. Hover tooltip with label. Bottom: mode switch button (→ Dashboard). No labels — icon-only.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build AutopilotSplitView: resizable left/right panels with drag handle',
            description: 'Create apps/web/src/components/autopilot/AutopilotSplitView.tsx. Left panel (WizardPanel) + right panel (PreviewPanel) with 8px drag handle between them. Default split: 50/50. Min width: 280px each. Persists split ratio in localStorage. Smooth resize animation.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Wire autopilot route /app/(autopilot)/page.tsx',
            description: 'Create apps/web/src/app/(autopilot)/page.tsx. Renders: ExecutionTopBar + AutopilotSplitView (left=WizardPanel, right=PreviewPanel) + LogStream (drawer/bottom panel). Reads project_id from URL params or context. Guards: redirect to /login if unauthenticated.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Implement AutopilotContext: shared state for session_id, phase, agents',
            description: 'Create apps/web/src/contexts/AutopilotContext.tsx. Provides: session_id, project_id, current_phase, active_agents[], task_queue_length, health_status. Updated by polling /api/orchestrate/status every 10s. Consumed by all autopilot sub-components via useAutopilot() hook.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build AutopilotControls: run, pause, stop, restart execution buttons',
            description: 'Create apps/web/src/components/autopilot/AutopilotControls.tsx. Buttons: Run (POST /api/orchestrate/activate), Pause (POST /api/orchestrate/safe-stop), Resume, Hard Stop with confirmation modal. Disabled states based on current phase from AutopilotContext. Real API calls only.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Add keyboard shortcuts for autopilot mode: R=run, P=pause, L=logs toggle',
            description: 'Add global keyboard handler in autopilot layout. Shortcuts: R → run, P → pause/resume, L → toggle log drawer, Esc → close modals. Show keyboard shortcut hints in UI (small kbd elements). Disable shortcuts when input fields are focused.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'low',
          },
        ],
      },

      // ── WS5 — Wizard Panel ────────────────────────────────────────────────────
      {
        title: 'WS5 — Wizard Panel',
        description: 'Build the Wizard Panel: real IRIS chat interface, step tracker, AI-driven state machine, assumption cards — zero mock data.',
        workstream: 'WS5',
        tasks: [
          {
            title: 'Build WizardPanel shell with step indicator and chat area',
            description: 'Create apps/web/src/components/wizard/WizardPanel.tsx. Structure: top WizardStepIndicator (steps 1-6 with completion state) + scrollable ChatArea + bottom ChatInput. Reads session state from /api/wizard/session?project_id=. Creates session on mount if none exists via POST /api/wizard/session.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build WizardChatBubble: user and IRIS message variants',
            description: 'Create apps/web/src/components/wizard/WizardChatBubble.tsx. Two variants: user (right-aligned, brand bg) and iris (left-aligned, neutral bg with IRIS avatar). IRIS variant supports: plain text, markdown rendering, embedded AssumptionCard, embedded ReadinessBar. Timestamps shown on hover.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build ChatInput: textarea with send, enter-to-submit, voice hint',
            description: 'Create apps/web/src/components/wizard/ChatInput.tsx. Textarea auto-grows to 4 lines max. Enter sends (Shift+Enter = newline). Disabled while awaiting IRIS response (shows typing indicator). Send button with loading state. Character count warning at 500+. Connects to POST /api/iris/chat.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build WizardStepIndicator: 6-step tracker with completion + current state',
            description: 'Create apps/web/src/components/wizard/WizardStepIndicator.tsx. Steps: (1) Project Context, (2) Goals, (3) Constraints, (4) Stack, (5) Review Assumptions, (6) Launch. Each step: circle with number, label, completion checkmark. Current step highlighted. Completed steps clickable (restore chat history).',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build AssumptionCard: IRIS-generated assumption with confirm/reject',
            description: 'Create apps/web/src/components/wizard/AssumptionCard.tsx. Card shows: assumption text, confidence badge (high/medium/low), category tag. Actions: ✓ Confirm / ✗ Reject / Edit. On action: POST /api/wizard-assumptions with { assumption_id, status }. Renders inside IRIS chat bubbles.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build ReadinessBar: real-time wizard completion progress',
            description: 'Create apps/web/src/components/wizard/ReadinessBar.tsx. Horizontal bar showing wizard readiness score (0-100%). Fetches from /api/wizard-readiness?project_id= every time IRIS responds. Color: red<40%, yellow<70%, green≥70%. Shows sub-scores for context/goals/constraints/stack.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Connect wizard chat to real IRIS session with optimistic UI',
            description: 'In WizardPanel: on user send → immediately append user bubble (optimistic) → POST /api/iris/chat with session_id + message → on response append IRIS bubble. On error: show error bubble with retry button. Session restored from /api/wizard/session on remount. No mock IRIS responses.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS6 — Live Preview ────────────────────────────────────────────────────
      {
        title: 'WS6 — Live Preview',
        description: 'Build the Live Preview panel: real blueprint output rendered as structured cards, real-time update highlighting, diff view for changes.',
        workstream: 'WS6',
        tasks: [
          {
            title: 'Build PreviewPanel shell with tabs: Blueprint / Tasks / Schema / Config',
            description: 'Create apps/web/src/components/preview/PreviewPanel.tsx. Header: "Live Preview" label + last-updated timestamp. Tabs: Blueprint (default) / Tasks / Schema / Config. Content area scrollable. Polling: refetch active tab data every 10s or on wizard response. No mock data.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build BlueprintView: render blueprint features/tasks as expandable tree',
            description: 'Create apps/web/src/components/preview/BlueprintView.tsx. Fetches /api/projects/[id]/blueprint. Renders: epic → feature → task hierarchy as collapsible tree. Each node: StatusBadge, agent_role chip, priority indicator. Empty state: "Wizard in progress — blueprint generating."',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build TasksView: filterable task list with inline status + agent',
            description: 'Create apps/web/src/components/preview/TasksView.tsx. Fetches /api/projects/[id]/tasks. Table: task title, agent_role, status, priority, updated_at. Filter bar: status multi-select, role filter, priority filter. Sort by: status / priority / updated. Virtualized for large task counts.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build ChangeHighlight: animate newly changed fields on polling update',
            description: 'Implement change detection in PreviewPanel: compare previous fetch result to new. Highlight changed fields with 2s yellow flash animation (CSS @keyframes). Track: status changes, new tasks added, new features added. Helps user see what IRIS is doing in real time.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Build SchemaView: display wizard-state and assumptions as structured JSON tree',
            description: 'Create apps/web/src/components/preview/SchemaView.tsx. Fetches /api/wizard-state?project_id=. Renders as collapsible JSON tree (react-json-tree or custom). Shows: project context, confirmed assumptions, pending assumptions, readiness scores. Read-only view.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Build ConfigView: show provider connections and integrations',
            description: 'Create apps/web/src/components/preview/ConfigView.tsx. Fetches /api/integrations/providers. Shows each provider (GitHub, Vercel, etc.) with: connected status, icon, last synced. "Connect" button links to /api/integrations/github/connect. No mock providers.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Add real-time preview sync: WebSocket or long-poll on wizard session events',
            description: 'Implement apps/web/src/hooks/usePreviewSync.ts. If WebSocket available: connect to /api/preview/stream. Fallback: poll active tab data every 8s. On update: emit "preview:updated" event consumed by PreviewPanel. Handles reconnection with exponential backoff.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
        ],
      },

      // ── WS7 — Execution Top Bar ───────────────────────────────────────────────
      {
        title: 'WS7 — Execution Top Bar',
        description: 'Build the Execution Top Bar: fixed 48px bar showing phase, active agents, task queue, system health, ETA, bottleneck detection — all from real orchestration data.',
        workstream: 'WS7',
        tasks: [
          {
            title: 'Build ExecutionTopBar shell: 48px fixed header in autopilot layout',
            description: 'Create apps/web/src/components/autopilot/ExecutionTopBar.tsx. Fixed 48px height at top of autopilot layout. Background: dark with subtle border-bottom. Left section: project name + phase chip. Center: metrics row. Right: health indicator + controls. Full width.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build PhaseChip: current execution phase with animated progress ring',
            description: 'Create apps/web/src/components/autopilot/PhaseChip.tsx. Shows current phase name (IDLE/PLANNING/EXECUTING/REVIEWING/COMPLETE) with color-coded background. Animated SVG progress ring showing % complete within phase. Data from AutopilotContext.current_phase.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build AgentsBar: active agent count with per-role breakdown on hover',
            description: 'Create apps/web/src/components/autopilot/AgentsBar.tsx. Shows total active agents count (e.g. "5 agents"). Hover dropdown: breakdown per role (backend_engineer ×2, frontend_engineer ×1, etc.) with StatusBadges. Data from /api/orchestrate/status active_agents field.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build TaskQueueMetric: queue depth, in-progress, completed today',
            description: 'Create apps/web/src/components/autopilot/TaskQueueMetric.tsx. 3 inline stats: Queue (pending+ready count) / Active (in_progress) / Done today (completed since midnight UTC). Clicking any stat opens TasksView filtered to that status. Updates every 15s.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build HealthIndicator: system health dot with uptime + error rate tooltip',
            description: 'Create apps/web/src/components/autopilot/HealthIndicator.tsx. Colored dot: green (healthy) / yellow (degraded) / red (incident). From /api/orchestrate/status health_status. Hover tooltip: uptime %, last incident, current error rate, watchdog last check. Pulse animation when degraded.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build ETADisplay: estimated time to completion with confidence level',
            description: 'Create apps/web/src/components/autopilot/ETADisplay.tsx. Calculates ETA from: tasks_remaining / avg_task_completion_rate. Shows: "~2h 15m" or "< 30m". Confidence badge (high/medium/low) based on data quality. If no data: "Calculating...". Tooltip: breakdown of calculation.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Build BottleneckAlert: surface blocked tasks + slow agents in top bar',
            description: 'Create apps/web/src/components/autopilot/BottleneckAlert.tsx. Polls /api/orchestrate/watchdog every 30s. If blocked tasks > 0 or agent stuck: show amber alert chip in top bar. Click: opens drawer with blocked task list + recommended actions. Clears when resolved.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Assemble ExecutionTopBar from all metric sub-components',
            description: 'Wire PhaseChip + AgentsBar + TaskQueueMetric + HealthIndicator + ETADisplay + BottleneckAlert + AutopilotControls into ExecutionTopBar. Horizontal scroll on overflow for narrow screens. All components consume AutopilotContext — single polling source, no duplicate fetches.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS8 — Log Stream ──────────────────────────────────────────────────────
      {
        title: 'WS8 — Log Stream',
        description: 'Build the real-time Log Stream: per-agent and system logs, live tail, level filtering, search, collapsible drawer — connected to real log endpoints.',
        workstream: 'WS8',
        tasks: [
          {
            title: 'Build LogStream container: bottom drawer with resize handle',
            description: 'Create apps/web/src/components/logs/LogStream.tsx. Bottom drawer: collapsed (32px tab) / expanded (200px default / resizable to 600px). Resize handle at top. Keyboard shortcut: L to toggle. Persists height in localStorage. Contains LogToolbar + LogList.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build LogEntry component: timestamp, level, source, message, expand',
            description: 'Create apps/web/src/components/logs/LogEntry.tsx. Single log row: timestamp (HH:MM:SS.ms), LevelBadge (info/warn/error/debug), source chip (agent role or "system"), message text. Long messages truncated with expand toggle. Error logs: red left border. Monospace font.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build LogToolbar: level filter, agent filter, search, auto-scroll toggle',
            description: 'Create apps/web/src/components/logs/LogToolbar.tsx. Left: level filter pills (ALL/INFO/WARN/ERROR). Center: agent filter dropdown (All agents + per-agent options). Right: search input (real-time filter) + auto-scroll toggle. "Clear" button clears displayed logs. "Export" downloads as .log file.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Implement log polling/streaming from /api/supervisor or log endpoint',
            description: 'Create apps/web/src/hooks/useLogStream.ts. Polls GET /api/supervisor?project_id= every 3s when log drawer is open. Accumulates log entries in useRef buffer (max 1000). Applies level + agent + search filters in memory. Emits to LogList for render. Pauses polling when drawer closed.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Build VirtualizedLogList: render 1000+ entries without performance lag',
            description: 'Create apps/web/src/components/logs/VirtualizedLogList.tsx. Uses react-virtual or windowing to render only visible LogEntry rows. Auto-scroll-to-bottom when new entries arrive (if auto-scroll enabled). Scroll lock: auto-scroll pauses when user scrolls up. Resume on scroll-to-bottom.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build AgentLogTab: per-agent log isolation in tabbed view',
            description: 'Create apps/web/src/components/logs/AgentLogTab.tsx. Tabs: System | per active agent role. Each tab shows only logs from that source. Tab badge shows unread count since last view. Switching tabs clears unread badge. Uses same useLogStream hook with source filter.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Add LogStream to autopilot layout and dashboard logs panel',
            description: 'Wire LogStream into: (1) autopilot layout as bottom drawer overlay, (2) dashboard LogsPreviewPanel shows last 20 entries from LogStream buffer. Shared log state via LogStreamContext to avoid duplicate API calls. Test: logs appear in real time as orchestration runs.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS9 — Mode Switch ─────────────────────────────────────────────────────
      {
        title: 'WS9 — Mode Switch',
        description: 'Implement seamless Dashboard ↔ Autopilot mode switching with state preservation and animated transition.',
        workstream: 'WS9',
        tasks: [
          {
            title: 'Build ModeSwitchButton: prominent toggle in sidebar and top bar',
            description: 'Create apps/web/src/components/layout/ModeSwitchButton.tsx. Two states: "Dashboard" (grid icon) and "Autopilot" (rocket icon). In sidebar: bottom section above user footer. In autopilot mini-sidebar: always visible. On click: navigate to /dashboard or /autopilot with current project_id preserved.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Implement route structure: /(dashboard) and /(autopilot) route groups',
            description: 'Ensure Next.js route groups are set up: apps/web/src/app/(dashboard)/ for Dashboard Mode, apps/web/src/app/(autopilot)/ for Autopilot Mode. Each has own layout.tsx. Project context passed via URL param [projectId] or query string. Navigation: /dashboard/[projectId] ↔ /autopilot/[projectId].',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Preserve active project context across mode switches',
            description: 'Create apps/web/src/contexts/ProjectContext.tsx. Stores: project_id, workspace_id, project_name. Persists to sessionStorage. On mode switch: project context follows. If no project selected: both modes redirect to /projects to pick one. Context provider wraps root layout.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Add animated page transition between Dashboard and Autopilot modes',
            description: 'Implement apps/web/src/components/layout/ModeTransition.tsx. On mode switch: animate out current mode (fade + scale 0.98→1 or slide), animate in next mode. Use Framer Motion or CSS transitions. Total transition time: 200ms. Disable animation for prefers-reduced-motion.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'low',
          },
          {
            title: 'Build ModeSwitchConfirmation: warn if execution running when switching away',
            description: 'Add guard in ModeSwitchButton: if AutopilotContext shows active execution (in_progress tasks > 0), show confirmation modal before switching to Dashboard. Modal: "Execution is running. Switching to Dashboard will not stop it. Continue?" with Cancel / Switch buttons.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
        ],
      },

      // ── WS10 — Backend Connection ─────────────────────────────────────────────
      {
        title: 'WS10 — Backend Connection',
        description: 'Wire all UI components to real production API endpoints. No mock data, no hardcoded values, no placeholder responses.',
        workstream: 'WS10',
        tasks: [
          {
            title: 'Create central API client: typed fetch wrapper with auth + error handling',
            description: 'Create apps/web/src/lib/api/client.ts. Typed fetch wrapper: apiGet<T>(url) / apiPost<T>(url, body). Auto-attaches Supabase session JWT as Bearer. On 401: triggers re-auth flow. On 5xx: shows toast error. Returns { data, error } never throws. All UI components use this client.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Create typed API hooks: useProject, useTasks, useOrchestration, useWizard',
            description: 'Create apps/web/src/hooks/useProject.ts, useTasks.ts, useOrchestration.ts, useWizard.ts. Each: SWR or custom polling hook that fetches real endpoints. Returns { data, loading, error, refetch }. Used by all dashboard + autopilot components. No inline fetch() calls in components.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Audit all components: replace any mock/hardcoded data with API hook calls',
            description: 'Grep codebase for: MOCK_, mockData, hardcoded UUIDs (except project feb25dda in dev), placeholder strings. Replace each with API hook or remove. Document: list of all components and their data sources in a comment block at top of each file. Zero tolerance for mock data in production.',
            role: 'frontend_engineer',
            task_type: 'review',
            status: 'pending',
            priority: 'critical',
          },
          {
            title: 'Implement SWR or React Query for data fetching with stale-while-revalidate',
            description: 'Install and configure SWR (or React Query) in apps/web. Global config: dedupingInterval 5s, revalidateOnFocus true, errorRetryCount 3. All useProject/useTasks/useOrchestration hooks migrate to useSWR(). Provides automatic background refresh, no manual polling.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Add global error boundary + toast notification system',
            description: 'Create apps/web/src/components/ui/ToastProvider.tsx (Radix Toast or sonner). Add React ErrorBoundary wrapping dashboard and autopilot layouts. API errors surface as toasts (non-blocking). Critical errors (auth failure, project not found) show inline error state. Never silently fail.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Add loading skeletons for all data-dependent components',
            description: 'Create apps/web/src/components/ui/Skeleton.tsx. Add SkeletonCard, SkeletonList, SkeletonText variants. Wire loading skeletons to all components using API hooks: StatsBar, ActiveExecutionsList, BlueprintView, TasksView, LogsPreviewPanel. Shows skeleton while loading=true, fades to content.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Run end-to-end connection audit: open each view, verify no 404s, no undefined renders',
            description: 'Manual + automated audit: open Dashboard, Autopilot, Wizard, Preview, Logs. Confirm: (1) no NetworkError or 404 in console, (2) no undefined/null renders, (3) loading states show then resolve, (4) error states show correct messages. Document any remaining gaps with task links.',
            role: 'qa_security_auditor',
            task_type: 'test',
            status: 'pending',
            priority: 'critical',
          },
        ],
      },

      // ── WS11 — Mobile (Basic) ─────────────────────────────────────────────────
      {
        title: 'WS11 — Mobile (Basic)',
        description: 'Implement basic mobile layout: bottom tab navigation with Chat, Preview, and Logs tabs. Responsive breakpoints for all existing components.',
        workstream: 'WS11',
        tasks: [
          {
            title: 'Build MobileTabBar: bottom tab navigation with Chat / Preview / Logs',
            description: 'Create apps/web/src/components/mobile/MobileTabBar.tsx. Fixed bottom bar (56px) on <768px viewport. 3 tabs: Chat (wizard icon), Preview (layout icon), Logs (terminal icon). Active tab highlighted. Only visible on mobile — hidden on desktop. Safe-area-inset-bottom for iOS.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Build MobileLayout: full-screen single-panel that swaps with tab selection',
            description: 'Create apps/web/src/app/(mobile)/layout.tsx. On mobile: shows only one panel at a time (Chat/Preview/Logs based on active tab). Swipe-to-switch panels (touch gesture). No sidebar. Header: project name + mode badge + back button. Uses MobileTabBar for navigation.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Ensure WizardPanel renders correctly on 375px width',
            description: 'Test WizardPanel at 375px (iPhone SE). Verify: chat bubbles don\'t overflow, ChatInput is accessible above keyboard, WizardStepIndicator collapses to dots-only on small width, ReadinessBar is full-width. Fix any overflow or z-index issues. Use Tailwind sm: breakpoint for adjustments.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'high',
          },
          {
            title: 'Ensure PreviewPanel renders correctly on mobile: single-tab collapsed view',
            description: 'On mobile, PreviewPanel shows as single scrollable list (no side-by-side). Tabs become a horizontal scroll strip. BlueprintView collapses tree depth to 2 levels. TasksView shows condensed rows (title + status only). Test at 375px and 768px.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Ensure LogStream renders correctly on mobile: full-screen modal',
            description: 'On mobile, LogStream tap opens as full-screen modal (not bottom drawer). Modal has close button top-right. LogToolbar above LogList. Auto-scroll works with iOS momentum scroll. Test: logs appear correctly, filtering works, close returns to previous tab.',
            role: 'frontend_engineer',
            task_type: 'code',
            status: 'pending',
            priority: 'medium',
          },
          {
            title: 'Add mobile responsive audit: test all breakpoints 375/768/1024/1440',
            description: 'Using browser DevTools device simulation: test 375px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop). For each: check for horizontal scroll, overflow, hidden content, broken layouts. Fix all issues. Document tested viewports in a comment in MobileLayout.',
            role: 'qa_security_auditor',
            task_type: 'test',
            status: 'pending',
            priority: 'high',
          },
        ],
      },

    ],
  },
]
