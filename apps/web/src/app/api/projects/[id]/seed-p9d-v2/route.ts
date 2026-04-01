/**
 * POST /api/projects/[id]/seed-p9d-v2
 * Seeds P9D v2 — Smart Wizard Product UX Re-Architecture
 * Epic: P9D v2 — Smart Wizard Product UX
 * Workstreams: WS1–WS13 (13 features)
 * Tasks: ~78 developer tasks
 *
 * Claude Cowork — Architect seed. Developers execute.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()
  const admin    = createAdminSupabaseClient()
  const projectId = params.id

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Create Epic ────────────────────────────────────────────────────────

  const { data: epic, error: epicErr } = await admin
    .from('epics')
    .insert({
      project_id:  projectId,
      title:       'P9D v2 — Smart Wizard Product UX Re-Architecture',
      description: 'Transform fragmented Autopilot/Wizard experience into the coherent Smart Wizard product operating layer. 13 workstreams covering rename, phase context model, left rail, chat panel, work panel, tasks, logs, sidebar, status hierarchy, transitions, and dead UI cleanup.',
      status:      'in_progress',
      priority:    'high',
      slug:        'p9d-v2-smart-wizard',
      order_index: 100,
    })
    .select('id')
    .single()

  if (epicErr) return NextResponse.json({ error: epicErr.message }, { status: 500 })
  const epicId = epic.id

  // ── 2. Define Workstreams ─────────────────────────────────────────────────

  const workstreams = [
    {
      slug: 'ws1-rename-entry', order_index: 1,
      title: 'WS1 — Smart Wizard Rename + Product Entry Model',
      description: 'Rename Autopilot → Smart Wizard across all UI text, routes, and metadata. Define clear entry points: after new project creation, from a project phase, from dashboard "Continue Phase".',
    },
    {
      slug: 'ws2-project-phase-context', order_index: 2,
      title: 'WS2 — Project + Phase Context Model',
      description: 'Smart Wizard must always know current project and current phase. Preserve projectId, phaseId, and phase conversation thread across reloads. No "New Project" fallback when real state exists. Create /api/projects/[id]/phases route using epics/features as phases.',
    },
    {
      slug: 'ws3-phase-system', order_index: 3,
      title: 'WS3 — Phase-Based Smart Wizard System',
      description: 'Project phases visible and clickable in Smart Wizard. Each phase has discussion context, tasks, status, and next actions. User can start and continue conversations per phase. Architect uses phase context to navigate and structure work.',
    },
    {
      slug: 'ws4-mini-sidebar', order_index: 4,
      title: 'WS4 — Mini Left Sidebar (Smart Wizard Nav)',
      description: 'Rework the 64px mini left rail. Must be functional on desktop (not just mobile toggle). Must contain: phase list/phase switch, current phase indicator, Logs entry, Settings. No dead controls — every icon must do something real.',
    },
    {
      slug: 'ws5-chat-panel', order_index: 5,
      title: 'WS5 — Chat Panel Rework',
      description: 'Reduce chat panel width (not 50% of screen). White/clean/minimal Apple-like visual treatment. Phase title + phase summary at top of chat. Clean conversation history. Remove blueprint preview panel that appears below the chat input.',
    },
    {
      slug: 'ws6-work-panel', order_index: 6,
      title: 'WS6 — Main Work Panel Re-Architecture',
      description: 'Right-side area becomes the real work area. Tab system: Preview, Tasks, Blueprint, Logs. All tabs real and connected to current phase/project. If Blueprint has no real value in current shape, replace with a phase overview. No decorative UI.',
    },
    {
      slug: 'ws7-tasks-tab', order_index: 7,
      title: 'WS7 — Tasks Tab (Kanban / Phase-Aware)',
      description: 'Tasks tab opens real kanban/task view filtered to active phase by default. Task cards connected to real data. Optional "Show all project tasks" toggle. Phase filter must be wired to the selected phase from the left rail.',
    },
    {
      slug: 'ws8-logs-activity', order_index: 8,
      title: 'WS8 — Logs / Activity Model',
      description: 'Logs tab/view surfaces real activity stream tied to active phase/project. LogStream component must be connected to real dispatch events, not just placeholders. User must feel the system is alive. Top status area and logs must make sense together.',
    },
    {
      slug: 'ws9-global-sidebar', order_index: 9,
      title: 'WS9 — Global Sidebar Redesign (Dashboard Mode)',
      description: 'Premium darker Vercel-like sidebar treatment for the dashboard mode sidebar. Workspace dropdown: show current workspace, switch workspace, create workspace (real flow). Keep only real/useful nav items. Remove shell-only items.',
    },
    {
      slug: 'ws10-project-switching', order_index: 10,
      title: 'WS10 — Project Switching + Drilldown',
      description: 'Clear project identity in both dashboard and Smart Wizard. Ability to switch to another project from the correct control. Preserve context while moving between dashboard and Smart Wizard. No confusion about which project the user is in.',
    },
    {
      slug: 'ws11-status-hierarchy', order_index: 11,
      title: 'WS11 — Status Hierarchy Rework',
      description: 'Replace raw technical counters with human-readable status layers. Project: Draft/Planning/Ready/Running/Blocked/Completed. Phase: Not started/In discussion/Ready for execution/Running/Review/Done. Task: Pending/Dispatched/Running/Awaiting review/Completed/Blocked. Top bar must communicate real meaning.',
    },
    {
      slug: 'ws12-motion-polish', order_index: 12,
      title: 'WS12 — Entry / Transition / Motion Polish',
      description: 'Smooth transition into Smart Wizard (fade+slide, 200–300ms). Smooth phase switching. Clean panel/tab transitions. No jarring layout jumps. Premium, subtle motion. Apply consistently across: Smart Wizard entry, phase switch, tab switch.',
    },
    {
      slug: 'ws13-dead-ui-cleanup', order_index: 13,
      title: 'WS13 — Dead UI / Shell Cleanup',
      description: 'Audit and remove or hide: dead links, shell-only controls, placeholder content, duplicate layout logic, stale labels, outdated "wizard"/"autopilot" references. Product must surface only real, meaningful UI after cleanup.',
    },
  ]

  const { data: features, error: featErr } = await admin
    .from('features')
    .insert(workstreams.map(ws => ({
      project_id:  projectId,
      epic_id:     epicId,
      title:       ws.title,
      description: ws.description,
      slug:        ws.slug,
      status:      'pending',
      priority:    'high',
      order_index: ws.order_index,
    })))
    .select('id, slug, order_index')

  if (featErr) return NextResponse.json({ error: featErr.message }, { status: 500 })

  // Map slug → featureId
  const featureMap: Record<string, string> = {}
  for (const f of features ?? []) featureMap[f.slug] = f.id

  // ── 3. Define Tasks ───────────────────────────────────────────────────────

  type TaskDef = {
    feature_slug: string
    title:        string
    description:  string
    agent_role:   string
    task_type:    string
    priority:     string
    order_index:  number
  }

  const tasks: TaskDef[] = [

    // ── WS1: Rename + Entry Model ──────────────────────────────────────────
    {
      feature_slug: 'ws1-rename-entry', order_index: 1,
      title: 'Rename "Autopilot" to "Smart Wizard" in all UI labels, page titles, and metadata',
      description: 'Search all .tsx/.ts files for "Autopilot" references in user-visible strings (not code identifiers). Update: page title metadata (generateMetadata), tab bar names, sidebar link labels, button text, toast messages, any "Autopilot Mode" text. Route /projects/[id]/autopilot keeps its URL but page title and all labels say "Smart Wizard". Keep code identifiers (AutopilotClient, AutopilotContext, etc.) unchanged to avoid breaking imports.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws1-rename-entry', order_index: 2,
      title: 'Update sidebar link "Autopilot Mode" → "Smart Wizard" in layout/Sidebar.tsx',
      description: 'In getProjectNav() inside apps/web/src/components/layout/Sidebar.tsx, find the "Autopilot Mode" NavItem and update its label to "Smart Wizard". Update the icon if appropriate (Sparkles or Wand2 from lucide-react). Ensure the href remains /projects/[id]/autopilot.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws1-rename-entry', order_index: 3,
      title: 'Add "Continue in Smart Wizard" CTA to project overview dashboard page',
      description: 'On the project overview page (/projects/[id]), add a prominent "Continue in Smart Wizard →" button that navigates to /projects/[id]/autopilot. The button should be in the hero/summary area, visually distinct. This makes Smart Wizard the clear next step after viewing the dashboard. Check useDashboardCTA hook for existing logic.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws1-rename-entry', order_index: 4,
      title: 'Ensure new project creation flow redirects to Smart Wizard (not /projects)',
      description: 'After a new project is provisioned via /api/projects/[id]/provision, the redirect must go to /projects/[id]/autopilot (Smart Wizard), not /projects. Audit the project creation flow: find where the post-provision redirect is defined. If it goes to /projects, change to /projects/{newProjectId}/autopilot. Check wizard/page.tsx, provision/route.ts, and any onSuccess handler in the UI.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws1-rename-entry', order_index: 5,
      title: 'QA: Verify Smart Wizard rename is complete — no visible "Autopilot" text remains',
      description: 'Manual QA check: navigate through the app and verify no user-visible text says "Autopilot" or "Autopilot Mode". Check: sidebar links, page titles, top bar, any buttons or headings. Compile a list of any remaining occurrences and file them as follow-up. Code identifiers (class names, variable names) are acceptable to remain.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'medium',
    },

    // ── WS2: Project + Phase Context ───────────────────────────────────────
    {
      feature_slug: 'ws2-project-phase-context', order_index: 1,
      title: 'Create GET /api/projects/[id]/phases route returning epics as phases',
      description: 'Create apps/web/src/app/api/projects/[id]/phases/route.ts. This GET route returns the project\'s epics ordered by order_index, mapped to a Phase shape: { id, title, description, status, order_index, task_counts: { total, completed, pending } }. Query epics table for the project, then for each epic query tasks COUNT grouped by status. Return { data: Phase[] }. Use admin client for task counts. This is what useProjectPhases hook calls.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws2-project-phase-context', order_index: 2,
      title: 'Add phaseId state to AutopilotClient — preserve selected phase across panel switches',
      description: 'In AutopilotClient.tsx, add useState<string | null> for selectedPhaseId. Pass selectedPhaseId down to MiniSidebar (for highlighting) and to IrisWorkspace (to scope the conversation). Default selectedPhaseId to the first in-progress phase from useProjectPhases. Store selectedPhaseId in sessionStorage keyed by projectId so it survives page refresh within the session.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws2-project-phase-context', order_index: 3,
      title: 'Fix IrisWorkspace new-project detection: show phase context for existing projects',
      description: 'IrisWorkspace currently always shows "Tell IRIS about your product idea" regardless of project state. Fix: if the project has tasks (completed > 0) or an existing blueprint, render the existing-project view (phase-specific chat, phase summary at top) instead of the new-project wizard. Pass a prop `hasExistingProject: boolean` from AutopilotClient (derived from orchestration stats — completed > 0 means existing). Existing project view should show the current phase title + summary at the top, then the conversation area.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical',
    },
    {
      feature_slug: 'ws2-project-phase-context', order_index: 4,
      title: 'Wire selectedPhaseId into IrisWorkspace chat context',
      description: 'When selectedPhaseId changes in AutopilotClient, IrisWorkspace should update its chat context to reflect the new phase. The system prompt or context for the IRIS chat should include the phase title, phase description, and phase task summary. Pass selectedPhase (the full Phase object, not just id) as a prop to IrisWorkspace. Display the phase name in the chat header area.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws2-project-phase-context', order_index: 5,
      title: 'QA: Verify phase context persists on page refresh and panel switch',
      description: 'Open Smart Wizard, select a phase. Switch to preview panel and back. Refresh the page. Verify: same phase is still selected after switching panels. Verify: same phase is restored after page refresh (via sessionStorage). Document any failures.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'medium',
    },

    // ── WS3: Phase-Based System ────────────────────────────────────────────
    {
      feature_slug: 'ws3-phase-system', order_index: 1,
      title: 'Build PhaseList component: renders phases from useProjectPhases with click selection',
      description: 'Create apps/web/src/components/smart-wizard/PhaseList.tsx. Renders a vertical list of phases. Each phase row shows: phase title, phase status badge (colored), task count (e.g. "12/20 tasks"). Clicking a phase calls onPhaseSelect(phaseId). Currently selected phase is highlighted. Show a loading skeleton while phases load. Show "No phases yet" empty state if data is empty. Use the Phase type from /api/projects/[id]/phases.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws3-phase-system', order_index: 2,
      title: 'Integrate PhaseList into expanded MiniSidebar or a slide-in phase panel',
      description: 'The MiniSidebar has a "phases" icon. When clicked, it should expand or reveal the PhaseList. Design: clicking the phases icon opens a 220px slide-in panel overlaying from the left (or expands the mini rail to 220px). The panel shows PhaseList. Clicking a phase selects it and closes the panel on mobile. On desktop the phase panel can remain open. Implement this expand/collapse behavior with smooth CSS transition (200ms).',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws3-phase-system', order_index: 3,
      title: 'Add phase status badge logic: map epic status → human-readable phase status',
      description: 'Map epic.status → PhaseStatus display: "pending" → "Not started", "in_progress" → "Running" (if has active tasks) or "In discussion" (if no active tasks), "completed" → "Done". Derive from both epic status and task counts (use the counts from /api/projects/[id]/phases). Export a getPhaseDisplayStatus(status, taskCounts) util. Use colored badges consistent with WS11 status hierarchy.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws3-phase-system', order_index: 4,
      title: 'Add phase summary card to the top of IrisWorkspace chat when a phase is selected',
      description: 'When selectedPhase is set in Smart Wizard, show a compact summary card at the top of the IrisWorkspace chat area (above the message list, below the chat header). Card shows: phase title, phase status badge, task counts summary (e.g. "12 completed / 20 total"), one-line description. Card should be dismissible or collapsible. Styling: white card with subtle border, clear typography.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws3-phase-system', order_index: 5,
      title: 'Wire phase selection to right work panel — update Tasks tab filter when phase changes',
      description: 'When selectedPhaseId changes, the Tasks tab in the right work panel must update to show tasks for that phase (epic). Pass selectedPhaseId from AutopilotClient to AutopilotPreviewPanel as a prop. TasksTab inside AutopilotPreviewPanel uses selectedPhaseId to filter its task query. When no phase is selected, show all project tasks.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },

    // ── WS4: Mini Left Sidebar ─────────────────────────────────────────────
    {
      feature_slug: 'ws4-mini-sidebar', order_index: 1,
      title: 'Rework MiniSidebar: add Phases icon, wire all icons to real behavior on desktop',
      description: 'Update MiniSidebar.tsx. Add a Phases icon (Layers from lucide-react) that triggers phase panel open. Fix the existing Wizard/Preview/Logs icons — on desktop they should switch the active panel (left chat vs right panel vs logs), not just update state that is ignored. Modify AutopilotClient.tsx to respect activePanel state on desktop: when "logs" is active, show LogStream full-width or expand the bottom drawer. When "preview" is active on mobile, show right panel. Remove the Settings icon if it links to nothing real.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws4-mini-sidebar', order_index: 2,
      title: 'Add visual active state to MiniSidebar icons that reflects actual panel visibility',
      description: 'The activePanel state in AutopilotClient.tsx must be the single source of truth for which panel is highlighted in MiniSidebar. Currently both panels are always visible on desktop, so the active state is meaningless. Fix: either (a) collapse the non-active panel to a minimum width or (b) use activePanel to visually emphasize one side. Option (a) preferred: when activePanel=\'preview\', collapse chat to 280px and expand preview. When activePanel=\'wizard\', expand chat to 60% and collapse preview. Add smooth width transition.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws4-mini-sidebar', order_index: 3,
      title: 'Add "Back to Dashboard" button at bottom of MiniSidebar with project navigation',
      description: 'At the bottom of MiniSidebar, add a "Dashboard" button (LayoutDashboard icon already imported) that navigates back to /projects/[id] preserving the projectId. This button is already partially implemented but verify it uses the correct projectId and navigation works. Tooltip should say "Back to Dashboard".',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },

    // ── WS5: Chat Panel Rework ─────────────────────────────────────────────
    {
      feature_slug: 'ws5-chat-panel', order_index: 1,
      title: 'Remove blueprint preview panel from below IrisWorkspace chat input',
      description: 'In IrisWorkspace (apps/web/src/components/iris/IrisWorkspace.tsx or similar), find the "Blueprint Preview" section that appears below the chat input area with "Start chatting with IRIS to see your project plan appear here in real time." Remove this section entirely. The blueprint/preview content belongs in the right-side work panel (AutopilotPreviewPanel), not below the chat. Verify no other component depends on this section.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws5-chat-panel', order_index: 2,
      title: 'Apply white/clean visual treatment to IrisWorkspace chat panel',
      description: 'Update IrisWorkspace styling: background should be white (bg-white) or very light gray (bg-slate-50). Message bubbles: user messages right-aligned with subtle brand color background; assistant messages left-aligned with light gray or white with border. Remove any dark backgrounds from the chat area. Header area: white with bottom border. Input area: white background, clean border. The chat should feel lightweight and Apple-like, not heavy/dark.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws5-chat-panel', order_index: 3,
      title: 'Add phase header bar at top of chat panel showing current phase name and status',
      description: 'Above the message list in IrisWorkspace (but below the top navigation/close button), add a slim phase header bar. Shows: phase name (or "Smart Wizard" if no phase selected), phase status badge, small "switch phase" link. This bar should be persistent and update when selectedPhase changes. Height: ~40px. Background: white with bottom border separator.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws5-chat-panel', order_index: 4,
      title: 'Constrain chat panel width on desktop: 35% of available area (not 50%)',
      description: 'In AutopilotClient.tsx desktop layout, the chat panel (IrisWorkspace) and preview panel each take flex-1 (50/50 split). Change the chat panel to a fixed proportion or constrained width. Recommended: chat panel gets 38%, preview panel gets 62%. Use flex with explicit flex-basis or width values. Or: use CSS custom property --chat-width: 38% and --preview-width: 62%. This gives more room to the work panel where real data is displayed.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },

    // ── WS6: Main Work Panel Re-Architecture ───────────────────────────────
    {
      feature_slug: 'ws6-work-panel', order_index: 1,
      title: 'Rework AutopilotPreviewPanel tabs: Preview, Tasks, Blueprint, Logs',
      description: 'Update AutopilotPreviewPanel.tsx. Ensure the tab system has exactly these tabs in order: Preview, Tasks, Blueprint, Logs. Tabs should be clearly labeled with icons: Eye (Preview), ListTodo (Tasks), FileText (Blueprint), Terminal (Logs). Active tab should have a clear visual indicator (underline or background). Tab content area should fill the available height. All tabs must render real content (not placeholder). Clicking Logs tab should show LogStream component inline.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws6-work-panel', order_index: 2,
      title: 'Replace Blueprint tab placeholder with real Phase Overview content',
      description: 'The Blueprint tab in AutopilotPreviewPanel currently shows either nothing useful or a "No blueprint yet" empty state. Replace it with a Phase Overview view: shows the selected phase\'s epic description, feature list (sub-workstreams), and progress summary. Use data from /api/projects/[id]/phases (the epic details). If the project has a real blueprint (from /api/projects/[id]/blueprint), render it as structured text. No "complete the wizard" prompts.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws6-work-panel', order_index: 3,
      title: 'Wire Preview tab to real draft-preview API data',
      description: 'The Preview tab should call GET /api/projects/[id]/draft-preview and render the result. If the project has a draft preview (website/app preview URL or HTML snapshot), display it in an iframe or as a formatted preview. If no preview is available, show a meaningful empty state: "Preview will appear here as your project is built" with a progress indicator. Do not show a dead iframe or blank panel.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws6-work-panel', order_index: 4,
      title: 'Inline Logs tab into AutopilotPreviewPanel using LogStream component',
      description: 'The Logs tab in AutopilotPreviewPanel should render the LogStream component (apps/web/src/components/logs/LogStream.tsx) inline, not as a bottom drawer. The LogStream should receive the projectId and phaseId props. Ensure the LogStream component can operate both in bottom-drawer mode (current) and inline mode. Add an `inline` prop to LogStream that adjusts its layout for panel display.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws6-work-panel', order_index: 5,
      title: 'QA: Verify all 4 work panel tabs render real content for an existing project',
      description: 'For project feb25dda (977 completed tasks), open Smart Wizard and click through all 4 tabs (Preview, Tasks, Blueprint, Logs). Verify: none shows a dead/blank panel, none shows "complete the wizard" prompts, all show data or a meaningful empty state. Document results and screenshot each tab.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },

    // ── WS7: Tasks Tab ─────────────────────────────────────────────────────
    {
      feature_slug: 'ws7-tasks-tab', order_index: 1,
      title: 'Build TasksTab component with kanban columns: Pending, Running, Done, Blocked',
      description: 'Update or create apps/web/src/components/wizard/TasksTab.tsx with a proper kanban layout. Columns: Pending (status: pending, ready), Running (status: dispatched, in_progress), Done (status: completed), Blocked (status: blocked, failed). Each column has a count badge and scrollable task card list. Task cards show: title (truncated to 2 lines), agent_role badge, priority indicator. No dummy data — all from real DB via useRealtimeTasks or useTasks hook.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws7-tasks-tab', order_index: 2,
      title: 'Add phase filter to TasksTab: filter tasks by selected phase (epic_id)',
      description: 'TasksTab should accept a selectedPhaseId prop. When set, filter tasks to only those belonging to that phase\'s features (via feature_id → epic_id join). The useTasks or useRealtimeTasks hook must support filtering by epic_id. Add a query parameter or filter option. Also add a "Show all tasks" toggle button that clears the phase filter. Display phase name as a filter label when active.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws7-tasks-tab', order_index: 3,
      title: 'Add task count summary bar above kanban: shows counts per status for current filter',
      description: 'Above the kanban columns in TasksTab, add a slim summary bar showing: total tasks, breakdown by status (e.g. "977 done · 1 running · 22 cancelled"). Updates in real-time with the current filter. Use the same data source as the kanban, no separate API call. Style: compact, pill badges with status colors matching the status hierarchy from WS11.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws7-tasks-tab', order_index: 4,
      title: 'QA: Verify Tasks tab shows real data and phase filter works',
      description: 'Open Smart Wizard → Tasks tab. Verify: task cards show real data (not dummy). Select a phase from left rail — verify Tasks tab filters to that phase. Toggle "Show all tasks" — verify all project tasks appear. Count should match DB counts (dispatched=1, completed=977, cancelled=22). Document any discrepancies.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'medium',
    },

    // ── WS8: Logs / Activity ───────────────────────────────────────────────
    {
      feature_slug: 'ws8-logs-activity', order_index: 1,
      title: 'Wire LogStream to real activity data: task dispatch events and completions',
      description: 'Audit apps/web/src/components/logs/LogStream.tsx. Verify it is pulling real data (not hardcoded/placeholder entries). The log stream should show: task dispatch events, task completions, orchestration ticks, any errors. If it uses a Supabase realtime subscription, verify the table it subscribes to exists and has data. If it polls an API, verify that API returns real events. Fix any dummy data.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws8-logs-activity', order_index: 2,
      title: 'Add inline mode to LogStream for use inside the Logs tab',
      description: 'LogStream currently renders as a bottom drawer with its own height management. Add an `inline?: boolean` prop. When inline=true: remove the drawer frame (no handle, no fixed positioning), render as a simple scrollable column filling parent height. The parent (Logs tab panel) provides the height constraint. Keep the existing drawer mode unchanged for the bottom-of-page usage.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws8-logs-activity', order_index: 3,
      title: 'Add phase-aware filtering to LogStream: show events relevant to selected phase',
      description: 'LogStream should accept an optional `featureId` prop (phase). When provided, filter the log stream to show only events related to tasks in that feature/phase. If the log source is a Supabase subscription or API, add a featureId filter. If filtering is too complex for now, at minimum show a label above the log stream indicating the current scope ("Showing: All project activity" or "Showing: Phase X activity").',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws8-logs-activity', order_index: 4,
      title: 'QA: Verify Logs tab shows real live activity — not empty or hardcoded',
      description: 'Open Smart Wizard → Logs tab. Verify entries appear and are real (not Lorem ipsum or hardcoded). Trigger an orchestration tick if needed. Verify log entries update within 30 seconds. Document the log format and any gaps in data quality.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'medium',
    },

    // ── WS9: Global Sidebar Redesign ────────────────────────────────────────
    {
      feature_slug: 'ws9-global-sidebar', order_index: 1,
      title: 'Apply premium dark Vercel-style visual treatment to layout/Sidebar.tsx',
      description: 'Update apps/web/src/components/layout/Sidebar.tsx visual styles. Target: darker background (slate-900 or slate-950), clean dividers, subtle hover states (slate-800), clear active states (brand accent). Nav item text: slate-300 default, white when active. Section labels (PROJECT): slate-500, uppercase, tracking-wider, 10px font. Workspace button at top: slightly different background (slate-800) with clear hover. Match the feel of Vercel, Linear, or Raycast sidebars.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws9-global-sidebar', order_index: 2,
      title: 'Improve workspace dropdown: add "Create workspace" option and real workspace list',
      description: 'The workspace dropdown in Sidebar.tsx currently shows a list of workspace names from state. Improve it: (1) Add a "Create workspace" option at the bottom with a + icon. Clicking it should navigate to /settings or open a modal (stub is acceptable if route doesn\'t exist). (2) Each workspace item should show its initial/avatar circle. (3) The currently active workspace gets a checkmark. (4) Workspace switch should call an API or update state correctly. Wire to real workspaces from DB if /api/workspaces exists, else show at least the current workspace with correct name.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws9-global-sidebar', order_index: 3,
      title: 'Remove dead nav items from dashboard sidebar; ensure every link resolves',
      description: 'Audit all NavItems in layout/Sidebar.tsx. Click each one and verify the page exists (no 404). Remove or comment out any nav item that links to a non-existent route. For items that should exist but don\'t have a page yet (e.g. Integrations, System), either create a minimal stub page or remove the link. Every visible nav item must navigate to a real page.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws9-global-sidebar', order_index: 4,
      title: 'Create stub pages for Orchestrate, Agents, System, Preview, Integrations if missing',
      description: 'For each project sub-route in the sidebar (Orchestrate: /projects/[id]/orchestrate, Agents: /projects/[id]/agents, System: /projects/[id]/system, Preview: /projects/[id]/preview, Integrations: /projects/[id]/integrations), check if the page.tsx exists. If not, create a minimal stub page that shows the page name and "Coming soon" message. This prevents 404s for sidebar nav items that were added in the previous audit fix.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws9-global-sidebar', order_index: 5,
      title: 'QA: Verify every sidebar link navigates to a real page (no 404s)',
      description: 'Click every sidebar link in both dashboard mode and verify it resolves without a 404 or redirect to login. Test: Projects, Wizard, Overview, Tasks, Orchestrate, Agents, System, Preview, Integrations, Smart Wizard, Settings. Document any broken routes. After this task, all nav links must be verified.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },

    // ── WS10: Project Switching ─────────────────────────────────────────────
    {
      feature_slug: 'ws10-project-switching', order_index: 1,
      title: 'Display current project name prominently in Smart Wizard top bar',
      description: 'In ExecutionTopBar.tsx, ensure the project name is displayed clearly. Currently projectName is passed as a prop. Display it in the left section of the top bar next to the phase chip. Format: "[ProjectName] · Smart Wizard". If projectName is long, truncate with ellipsis at 24 characters. This makes it immediately clear which project the user is in.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws10-project-switching', order_index: 2,
      title: 'Add project switcher dropdown in Smart Wizard top bar or MiniSidebar',
      description: 'Add a way for the user to switch projects while in Smart Wizard without going back to the dashboard. Implementation: in the top bar left section, make the project name clickable. On click, show a small dropdown with the list of user\'s projects (fetch from /api/projects). Selecting a project navigates to /projects/[newId]/autopilot. Dropdown should show project name and status badge. Maximum 8 items, with "View all projects" link at bottom.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws10-project-switching', order_index: 3,
      title: 'Ensure project identity is visible on the dashboard overview page header',
      description: 'The project overview page (/projects/[id]) should prominently show the project name in the page header or TopBar. Check the existing TopBar component and the project overview page. Ensure the project name appears in the browser tab title (generateMetadata) and in the visible page header. Add project status badge next to the name if not already present.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },

    // ── WS11: Status Hierarchy ─────────────────────────────────────────────
    {
      feature_slug: 'ws11-status-hierarchy', order_index: 1,
      title: 'Create getProjectStatus(taskCounts, runActive) utility for human-readable project status',
      description: 'Create apps/web/src/lib/status-display.ts. Export getProjectStatus(taskCounts, runActive, safeStopped): returns one of: "Draft" (0 tasks), "Planning" (tasks pending, not started), "Running" (active agents > 0), "Paused" (safe_stop=true), "Blocked" (blocked tasks > 0), "Complete" (all tasks done). Also export getProjectStatusColor(status): returns Tailwind classes for badge. Also export getPhaseStatus(epicStatus, taskCounts): returns "Not started" | "In discussion" | "Ready for execution" | "Running" | "Review" | "Done".',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws11-status-hierarchy', order_index: 2,
      title: 'Update ExecutionTopBar to use human-readable project status (not raw phase enum)',
      description: 'In ExecutionTopBar.tsx, the PhaseChip currently shows the raw phase from useOrchestration ("executing", "idle", etc.). Replace with a human-readable status using getProjectStatus from status-display.ts. The agent count should say "1 agent building" or "0 agents" (no "agents" label for 0). The task counts should say "977 done" not "977 completed". Make every visible counter understandable to a non-technical user.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws11-status-hierarchy', order_index: 3,
      title: 'Make agent count clickable in top bar: opens an agent details popover',
      description: 'In ExecutionTopBar.tsx, the "1 agent" count should be clickable. On click, show a small popover/dropdown listing the currently active agents: agent_role, task they are working on (from task title), time dispatched. Data from useOrchestration status.active_agents. If no agents active, clicking shows "No agents currently active." Popover closes on click-outside. This makes the agent count meaningful instead of decorative.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws11-status-hierarchy', order_index: 4,
      title: 'Apply consistent status badge styling across all project cards and phase lists',
      description: 'Using the status-display.ts utilities from the previous task, update all places in the UI that show a status badge: project cards, phase list items, task cards, top bar. All should use the same color system and label vocabulary. Ensure "Running" is always green-pulse, "Blocked" is always red, "Done" is always emerald, "Planning" is always violet. Eliminate any status strings that differ from the standard vocabulary.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },

    // ── WS12: Motion Polish ─────────────────────────────────────────────────
    {
      feature_slug: 'ws12-motion-polish', order_index: 1,
      title: 'Add smooth fade+slide transition when entering Smart Wizard from dashboard',
      description: 'When navigating from the project overview (/projects/[id]) to Smart Wizard (/projects/[id]/autopilot), add a fade+slide-up transition. Implementation: wrap AutopilotClient in a div with initial opacity-0 translate-y-2, animate to opacity-100 translate-y-0 on mount. Use CSS transition (200ms ease-out) or a simple useEffect with a class toggle. This should feel like a purposeful mode switch, not a hard page change.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws12-motion-polish', order_index: 2,
      title: 'Add phase switch animation: fade out/in chat content when selectedPhase changes',
      description: 'When the user clicks a different phase in the left rail, the chat panel content (messages, phase header) should fade out briefly and fade back in with the new phase context. Use a key-based remount with opacity transition, or use an opacity animation triggered by phaseId change. Duration: 150ms fade out, 150ms fade in. This signals to the user that the context has changed.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'low',
    },
    {
      feature_slug: 'ws12-motion-polish', order_index: 3,
      title: 'Add tab switch animation in AutopilotPreviewPanel: crossfade between tab contents',
      description: 'When switching tabs in AutopilotPreviewPanel (Preview/Tasks/Blueprint/Logs), add a subtle crossfade: outgoing tab content fades to 0 opacity over 100ms, incoming tab content fades in from 0 to 1 over 150ms. Use a key prop on the tab content container to trigger React re-mount with CSS animation. Ensure the tab bar itself does not animate — only the content area below.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'low',
    },

    // ── WS13: Dead UI Cleanup ───────────────────────────────────────────────
    {
      feature_slug: 'ws13-dead-ui-cleanup', order_index: 1,
      title: 'Remove or stub out the /projects/[id]/wizard route (conflicts with Smart Wizard model)',
      description: 'There are two wizard-related routes: /projects/[id]/wizard and the new Smart Wizard at /projects/[id]/autopilot. The /projects/[id]/wizard page should either redirect to /projects/[id]/autopilot or be removed entirely. Check if any UI links to /projects/[id]/wizard. If yes, update them. If the page is unused, delete it. The global /wizard route (src/app/(app)/wizard/page.tsx) should remain as the entry point redirect.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws13-dead-ui-cleanup', order_index: 2,
      title: 'Remove or suppress the stale dispatched task: "Add workspace dropdown to layout/Sidebar.tsx"',
      description: 'Task ID 47a45d02-081d-4e32-abd6-8607abe00c70 has been in dispatched state for 22+ hours with dispatched_at=NULL (never actually started). This task is now obsolete — the sidebar dropdown was fixed manually. Cancel it via: UPDATE tasks SET status=\'cancelled\', failure_category=\'superseded\', failure_detail=\'Fixed manually during UX audit\' WHERE id=\'47a45d02-081d-4e32-abd6-8607abe00c70\'. This is a DB admin task.',
      agent_role: 'backend_engineer', task_type: 'migration', priority: 'high',
    },
    {
      feature_slug: 'ws13-dead-ui-cleanup', order_index: 3,
      title: 'Audit and remove all placeholder/dummy text from Smart Wizard surfaces',
      description: 'Search all components in /components/iris/, /components/wizard/, /components/autopilot/ for hardcoded placeholder strings like "Lorem ipsum", "Coming soon", "Start chatting with IRIS to see your project plan", "No blueprint yet" (when blueprint exists), "Complete the wizard on the left". Remove or replace each with a meaningful empty state or real content. Each empty state should be descriptive and not imply the user needs to do something they\'ve already done.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'high',
    },
    {
      feature_slug: 'ws13-dead-ui-cleanup', order_index: 4,
      title: 'Remove or fix any Settings icon/link in Smart Wizard that navigates nowhere',
      description: 'MiniSidebar has a Settings icon (gear) at the bottom. Verify it navigates to a real settings page. If /settings exists, it should navigate there. If not, either create a minimal /settings stub or remove the icon from MiniSidebar. No dead controls allowed.',
      agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium',
    },
    {
      feature_slug: 'ws13-dead-ui-cleanup', order_index: 5,
      title: 'Final QA pass: no dead controls, no placeholder content, no broken routes in Smart Wizard',
      description: 'Comprehensive final check on the Smart Wizard surface. Click every button, icon, and link. Verify: (1) no 404 routes, (2) no hardcoded placeholder text visible to user, (3) no buttons/icons that do nothing on click, (4) all status indicators show real data, (5) the product feels coherent and intentional. Compile a list of any remaining issues classified as CRITICAL / HIGH / MEDIUM / LOW.',
      agent_role: 'qa_engineer', task_type: 'qa', priority: 'high',
    },
  ]

  // ── 4. Insert Tasks ───────────────────────────────────────────────────────

  const taskInserts = tasks.map((t, idx) => ({
    project_id:   projectId,
    feature_id:   featureMap[t.feature_slug],
    title:        t.title,
    description:  t.description,
    agent_role:   t.agent_role,
    task_type:    t.task_type,
    priority:     t.priority,
    status:       'pending',
    order_index:  idx + 1,
    max_retries:  2,
    delivery_type: 'code',
  }))

  const { data: insertedTasks, error: taskErr } = await admin
    .from('tasks')
    .insert(taskInserts)
    .select('id')

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    epic_id:      epicId,
    workstreams:  workstreams.length,
    tasks_seeded: insertedTasks?.length ?? 0,
    summary: {
      ws1_rename_entry:         tasks.filter(t => t.feature_slug === 'ws1-rename-entry').length,
      ws2_project_phase_context: tasks.filter(t => t.feature_slug === 'ws2-project-phase-context').length,
      ws3_phase_system:         tasks.filter(t => t.feature_slug === 'ws3-phase-system').length,
      ws4_mini_sidebar:         tasks.filter(t => t.feature_slug === 'ws4-mini-sidebar').length,
      ws5_chat_panel:           tasks.filter(t => t.feature_slug === 'ws5-chat-panel').length,
      ws6_work_panel:           tasks.filter(t => t.feature_slug === 'ws6-work-panel').length,
      ws7_tasks_tab:            tasks.filter(t => t.feature_slug === 'ws7-tasks-tab').length,
      ws8_logs_activity:        tasks.filter(t => t.feature_slug === 'ws8-logs-activity').length,
      ws9_global_sidebar:       tasks.filter(t => t.feature_slug === 'ws9-global-sidebar').length,
      ws10_project_switching:   tasks.filter(t => t.feature_slug === 'ws10-project-switching').length,
      ws11_status_hierarchy:    tasks.filter(t => t.feature_slug === 'ws11-status-hierarchy').length,
      ws12_motion_polish:       tasks.filter(t => t.feature_slug === 'ws12-motion-polish').length,
      ws13_dead_ui_cleanup:     tasks.filter(t => t.feature_slug === 'ws13-dead-ui-cleanup').length,
    },
  })
}
