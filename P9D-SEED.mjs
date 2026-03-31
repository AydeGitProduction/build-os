// P9D SEED SCRIPT — UX System Refinement + Power Wizard Architecture
import { randomUUID } from 'crypto';

const SUPABASE_URL = 'https://zyvpoyxdxedcugtdrluc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dnBveXhkeGVkY3VndGRybHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY5MDQ1MiwiZXhwIjoyMDkwMjY2NDUyfQ.VF0cT6AhlaZyi8OOOU_0OuiL1jv-DcKrbLLo6WGIy8Q';
const PROJECT_ID = 'feb25dda-6352-42fa-bac8-f4a7104f7b8c';
const HEADERS = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

async function post(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) { console.error(`POST ${table} FAILED`, data); process.exit(1); }
  return Array.isArray(data) ? data[0] : data;
}

async function main() {
  // ── EPIC ────────────────────────────────────────────────────────────────────
  const epicId = randomUUID();
  const epic = await post('epics', {
    id: epicId,
    project_id: PROJECT_ID,
    title: 'P9D — UX System Refinement + Power Wizard Architecture',
    description: 'Transform BuildOS into a coherent product UX: Power Wizard (project-aware, phase-based), Vercel-style sidebar with workspace dropdown, clean 3-column layout, fully connected right panel (Preview/Tasks/Blueprint), context persistence, transitions, and cleanup. No mock data. Developer execution phase.',
    status: 'pending',
    order_index: 1203,
    slug: 'p9d-ux-system-refinement-power-wizard',
    priority: 'high',
  });
  console.log('✅ Epic created:', epic.id, epic.title);

  // ── WORKSTREAMS (features) + TASKS ──────────────────────────────────────────
  const workstreams = [
    {
      title: 'WS1 — Power Wizard Re-Architecture',
      description: 'Rename Autopilot to Power Wizard, implement project-aware detection on mount, load existing blueprint/conversation, show correct view based on project state.',
      order_index: 0,
      tasks: [
        { title: 'Rename all Autopilot references to Power Wizard', description: `Rename across codebase:\n- Component: AutopilotClient.tsx → PowerWizardClient.tsx\n- Route: /autopilot → /wizard\n- Sidebar label: "Autopilot Mode" → "Power Wizard"\n- Page title: "Autopilot" → "Power Wizard"\n- All import paths, references, type names\n\nUSE: grep -r "autopilot\\|Autopilot" apps/web/src --include="*.tsx" --include="*.ts" -l to find all files.\nDo NOT rename backend dispatch logic or DB columns — only frontend UI labels/routes/components.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.06 },
        { title: 'Remove Power Wizard from global sidebar nav', description: `Remove the "Autopilot Mode" / "Power Wizard" item from the global sidebar (Sidebar.tsx).\nInstead of a sidebar entry, the Power Wizard is accessed via:\n1. "Open Power Wizard" button on the Dashboard\n2. Auto-redirect on project creation\n\nDo not remove the route itself, just remove the nav item.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.03 },
        { title: 'Implement blueprint existence check on Power Wizard mount', description: `In PowerWizardClient.tsx (formerly AutopilotClient.tsx), on component mount:\n1. Call GET /api/projects/[id]/blueprint\n2. Unwrap correctly: const bp = r.data?.data ?? null  (not r.data alone)\n3. If blueprint exists: set mode = "execution"\n4. If no blueprint: set mode = "onboarding"\n\nStore mode in React state. Render different UI branches based on mode.\n\nThis is the fix for the core bug: IRIS always showed "New Project" even for projects with 977 tasks.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 3, estimated_cost_usd: 0.07 },
        { title: 'Build execution-mode view for Power Wizard (existing projects)', description: `When blueprint exists (mode="execution"), render:\n\nLeft panel:\n- Project name (large)\n- Phase list (WS2 will expand this)\n- Stats: total tasks, completed, active\n- "New Phase" button\n\nChat panel:\n- Load existing conversation from blueprint.conversation_history (if present)\n- If no prior conversation: show "Continue your project" prompt with context summary\n- Input field active for continuation\n\nRight panel:\n- Tab: Preview | Tasks | Blueprint (WS4 handles real data)\n\nNO onboarding prompts ("Build a SaaS product", etc.) in execution mode.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 4, estimated_cost_usd: 0.10 },
        { title: 'Fix IRIS breadcrumb to show real project name', description: `In PowerWizardClient.tsx / IrisWorkspace.tsx:\n- Breadcrumb currently shows "IRIS / New Project"\n- Fix: receive projectName as prop (passed from parent page via server-side project fetch)\n- Render: "IRIS / [projectName]" always\n- Page (app)/(app)/projects/[id]/wizard/page.tsx should fetch project server-side and pass name as prop\n\nAcceptance: breadcrumb shows "IRIS / SaaS 4 SaaS" for the SaaS 4 SaaS project`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 5, estimated_cost_usd: 0.04 },
        { title: 'Connect readiness gauge to real blueprint score', description: `The "0% Gathering context" progress indicator:\n- If mode="onboarding": show real chat completion % (e.g., questionsAnswered / totalQuestions)\n- If mode="execution": hide the gauge entirely (project is already configured)\n- If in onboarding and blueprint is being generated: poll /api/projects/[id]/blueprint status and show progress\n\nDo not show a stuck "0%" gauge in any state.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 6, estimated_cost_usd: 0.05 },
        { title: 'Update Power Wizard route: /projects/[id]/wizard', description: `Move route from /projects/[id]/autopilot to /projects/[id]/wizard:\n1. Rename directory: app/(app)/projects/[id]/autopilot/ → app/(app)/projects/[id]/wizard/\n2. Update AppShell.tsx pathname detection: isAutopilot → isWizard, check pathname.includes('/wizard')\n3. Update all href links to use /wizard instead of /autopilot\n4. Ensure old /autopilot route redirects to /wizard (add redirect in next.config.js)\n\nDo NOT break navigation - test that all entry points still work.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 7, estimated_cost_usd: 0.05 },
      ]
    },
    {
      title: 'WS2 — Phase-Based Wizard System',
      description: 'Each project supports multiple phases. Each phase has its own wizard, chat, task set, and state. Mini sidebar lists phases and allows switching.',
      order_index: 1,
      tasks: [
        { title: 'Design phase data model + DB migration', description: `Create a phases table (or use JSONB phases column on blueprints):\n\nOption A (preferred): phases table\n  - id UUID PK\n  - project_id UUID FK\n  - blueprint_id UUID FK (nullable)\n  - title TEXT NOT NULL\n  - description TEXT\n  - status TEXT DEFAULT 'pending' CHECK IN ('pending','active','completed')\n  - order_index INTEGER DEFAULT 0\n  - conversation_history JSONB DEFAULT '[]'\n  - created_at TIMESTAMPTZ DEFAULT NOW()\n  - updated_at TIMESTAMPTZ DEFAULT NOW()\n\nCreate SQL migration file: migrations/[timestamp]_phases.sql\nInclude RLS: authenticated users can CRUD their own project phases.\n\nIMPORTANT: Do NOT use pg.Client. Write the migration as a plain SQL file in the migrations/ directory. Apply via Supabase SQL Editor (noted in project docs).`, agent_role: 'backend_engineer', task_type: 'schema', priority: 'high', order_index: 1, estimated_cost_usd: 0.06 },
        { title: 'Create phases API routes', description: `Create REST API routes:\n\nGET /api/projects/[id]/phases — list all phases for project\nPOST /api/projects/[id]/phases — create new phase\nPATCH /api/projects/[id]/phases/[phaseId] — update phase (status, title, conversation)\nDELETE /api/projects/[id]/phases/[phaseId] — delete phase\n\nAll routes must:\n- Use Supabase server client (not pg.Client)\n- Require authentication\n- Return standard { data, error } envelope\n\nFile locations:\n  apps/web/src/app/api/projects/[id]/phases/route.ts\n  apps/web/src/app/api/projects/[id]/phases/[phaseId]/route.ts`, agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.08 },
        { title: 'Build PhaseList mini sidebar component', description: `Create component: apps/web/src/components/wizard/PhaseList.tsx\n\nProps: { phases: Phase[], activePhaseId: string, onPhaseSelect: (id: string) => void, onNewPhase: () => void }\n\nUI (collapsed, icon-only by default):\n- Each phase: circular badge with phase number + status color\n  - pending: gray\n  - active: blue\n  - completed: green\n- Hover: tooltip shows phase title\n- Active phase: highlighted ring\n- Bottom: + icon for new phase\n\nUI (expanded):\n- Phase number + title\n- Status chip\n- Same + button labeled "New Phase"\n\nToggle between collapsed/expanded via icon click at top.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 3, estimated_cost_usd: 0.07 },
        { title: 'Implement phase switching in Power Wizard', description: `In PowerWizardClient.tsx:\n1. Fetch phases on mount: GET /api/projects/[id]/phases\n2. If no phases and blueprint exists: auto-create Phase 1 from blueprint\n3. activePhaseId state (persisted to URL: ?phase=[phaseId])\n4. On phase switch: save current chat state, load new phase chat history\n5. Each phase maintains independent conversation_history in DB\n6. Render PhaseList component in left mini sidebar slot\n\nPhase state must persist on page reload via URL param.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 4, estimated_cost_usd: 0.09 },
        { title: 'Phase creation flow', description: `When user clicks "New Phase":\n1. Prompt: text input "What do you want to build in this phase?"\n2. POST /api/projects/[id]/phases with title\n3. New phase becomes activePhaseId\n4. IRIS chat resets for new phase (new conversation)\n5. Phase gets status: "active"\n\nWhen phase is completed (all tasks done or user marks complete):\n- Status → "completed"\n- Phase badge shows green checkmark\n\nMax phases: 20 per project (soft limit in UI).`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 5, estimated_cost_usd: 0.07 },
        { title: 'Seed Phase 1 from existing blueprint for SaaS 4 SaaS', description: `For the existing SaaS 4 SaaS project (ID: feb25dda-6352-42fa-bac8-f4a7104f7b8c):\n\nOnce the phases table is created, auto-migrate: check if project has blueprint but no phases. If so:\n1. Create Phase 1: "Initial Build" with status "active"\n2. Link to existing blueprint_id\n3. Import any existing conversation_history from blueprint\n\nThis can be done as an idempotent migration script run once, or as logic in the Power Wizard mount (check phases.length === 0 && blueprint !== null → create Phase 1 automatically).`, agent_role: 'backend_engineer', task_type: 'migration', priority: 'medium', order_index: 6, estimated_cost_usd: 0.04 },
      ]
    },
    {
      title: 'WS3 — Layout Simplification',
      description: 'Replace fragmented layout with clean 3-column: mini sidebar (phases) | chat panel | main panel. Remove middle blueprint overlay.',
      order_index: 2,
      tasks: [
        { title: 'Redesign Power Wizard 3-column layout', description: `Replace current AutopilotClient layout with clean 3-column grid:\n\nColumn 1 (mini sidebar, 48px collapsed / 220px expanded):\n  - PhaseList component (from WS2)\n  - Icon-only by default\n\nColumn 2 (chat panel, flex-1, min 360px):\n  - IRIS chat interface\n  - Fills remaining space after mini sidebar\n  - No blueprint overlay on top (that was the bug)\n\nColumn 3 (main panel, 420px fixed or 35% of viewport):\n  - Tab bar: Preview | Tasks | Blueprint\n  - Tab content area\n\nCSS approach: CSS Grid with columns: [collapsed:48px expanded:220px] 1fr [fixed:420px]\nUse CSS custom property --mini-sidebar-width for toggle.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 1, estimated_cost_usd: 0.09 },
        { title: 'Remove middle blueprint preview overlay from chat panel', description: `The current layout has a semi-transparent "Blueprint Preview" overlay on top of the chat input area.\nThis was causing the "chat behind blur" bug.\n\nREMOVE:\n- The blueprint preview glass overlay in the center panel\n- Any z-index stacking that places the preview over the chat\n\nThe blueprint is now in its own dedicated tab in the RIGHT panel (Column 3).\nThe chat panel (Column 2) must be clean: only the IRIS chat messages + input bar.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.04 },
        { title: 'Ensure chat panel is full-height scrollable', description: `Chat panel (Column 2) requirements:\n- Full height: flex-1, min-h-0, overflow-y-auto for messages area\n- Input bar: fixed at bottom of column (sticky or absolute positioned)\n- Messages scroll independently from input\n- New messages auto-scroll to bottom\n- No overflow issues on smaller viewports\n\nTest: type 20+ messages, verify scroll works, input stays visible.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 3, estimated_cost_usd: 0.04 },
        { title: 'Make Power Wizard layout responsive', description: `Desktop (≥1024px): 3-column layout as described.\nTablet (768–1023px): 2-column: [mini sidebar] [chat+main tabbed]\nMobile (<768px): Full screen with bottom tab bar (Chat | Preview | Tasks)\n\nUse Tailwind responsive classes. No horizontal overflow on any viewport.\nTest at 768px, 1024px, 1280px, 1440px.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 4, estimated_cost_usd: 0.06 },
        { title: 'Update AppShell to detect /wizard route', description: `AppShell.tsx currently checks for /autopilot:\n  const isAutopilot = pathname.includes('/autopilot')\n\nUpdate to:\n  const isWizard = pathname.includes('/wizard')\n\nAlso update the full-screen container class if needed.\nEnsure sidebar is suppressed on /wizard routes, same as /autopilot was.\n\nIf /autopilot still exists as a redirect, keep backward compatibility.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 5, estimated_cost_usd: 0.03 },
      ]
    },
    {
      title: 'WS4 — Main Panel (Right) — Real Data Tabs',
      description: 'Implement the 3-tab right panel (Preview, Tasks, Blueprint) with all tabs connected to real API data.',
      order_index: 3,
      tasks: [
        { title: 'Build RightPanel tab system with Preview | Tasks | Blueprint tabs', description: `Create component: apps/web/src/components/wizard/RightPanel.tsx\n\nProps: { projectId: string, activeTab: "preview"|"tasks"|"blueprint", onTabChange: (tab) => void }\n\nRender:\n- Tab bar at top: 3 tabs with icons + labels\n- Active tab underline indicator\n- Tab content area below (fills remaining height)\n\nEach tab content is a separate component:\n- PreviewTab: renders live preview iframe\n- TasksTab: renders task list\n- BlueprintTab: renders blueprint viewer\n\nDefault active tab: "tasks" for existing projects, "blueprint" for new ones.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.07 },
        { title: 'PreviewTab — connect to real deployment URL', description: `Create apps/web/src/components/wizard/PreviewTab.tsx\n\nFetch: GET /api/projects/[id] to get project.preview_url or project.deployment_url\n\nIf URL exists:\n  <iframe src={url} className="w-full h-full border-0 rounded-lg" />\n  + refresh button + open-in-new-tab button\n  + "Live · [timestamp]" indicator\n\nIf no URL:\n  Empty state: "No deployment yet. Run the wizard to generate a preview."\n\nFor SaaS 4 SaaS: preview URL = https://web-lake-one-88.vercel.app\nThis must be stored in the project record or derived from provider_connections.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.07 },
        { title: 'TasksTab — show real tasks with correct filter', description: `Create apps/web/src/components/wizard/TasksTab.tsx\n\nFetch: GET /api/projects/[id]/tasks?limit=50&order=updated_at.desc\n\nCRITICAL FIX:\n- Do NOT filter to only in_progress tasks\n- Show: all statuses grouped by status\n  - Active (in_progress, ready, dispatched): shown first\n  - Recently completed: last 20 completed tasks\n  - Blocked: show with reason\n\nEach task row:\n- Status icon (colored)\n- Title (truncated if > 60 chars)\n- Agent role badge\n- Updated time (relative)\n\nIf 0 tasks in any status: show accurate empty state ("No tasks yet" or "All tasks complete").\nDo NOT show "No active tasks" when 955 completed tasks exist.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 3, estimated_cost_usd: 0.08 },
        { title: 'BlueprintTab — load real blueprint with envelope fix', description: `Create apps/web/src/components/wizard/BlueprintTab.tsx\n\nFetch with CORRECT envelope unwrap:\n  const r = await apiGet<{ data: Blueprint | null }>(\`/api/projects/\${projectId}/blueprint\`)\n  const bp = r.data?.data ?? null  // CRITICAL: unwrap the { data: ... } envelope\n\nIf bp exists, render:\n  - Project title + description\n  - Tech stack chips\n  - Phase count + epic count\n  - "View full blueprint" expandable section\n\nIf no blueprint:\n  Empty state: "No blueprint yet. Chat with IRIS to generate one."\n\nThis is the P9C-DEBUG fix — must be applied correctly here.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 4, estimated_cost_usd: 0.07 },
        { title: 'Persist active tab in URL query param', description: `RightPanel active tab must survive navigation:\n- URL: /projects/[id]/wizard?tab=tasks\n- useSearchParams() to read tab\n- useRouter().push() to update on tab change\n- Default: "tasks" if no param\n\nThis ensures: refresh stays on same tab, shareable URLs work.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 5, estimated_cost_usd: 0.03 },
      ]
    },
    {
      title: 'WS5 — Mini Sidebar Left (Phase Navigation)',
      description: 'Icon-only collapsible mini sidebar showing phases. Supports expand/collapse. No text labels in collapsed mode.',
      order_index: 4,
      tasks: [
        { title: 'Build MiniSidebar shell component', description: `Create apps/web/src/components/wizard/MiniSidebar.tsx\n\nDefault state: COLLAPSED (width: 48px)\nExpanded state: width: 220px\n\nContains:\n- Top: expand/collapse toggle icon (ChevronRight / ChevronLeft)\n- Middle: phase list (from WS2 PhaseList)\n- Bottom: settings icon (goes to project settings)\n\nCollapsed: only icons, no text\nExpanded: icons + labels\n\nTransition: width transition 150ms ease\n\nCSS custom property --mini-sidebar-width controls Column 1 in grid layout.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.05 },
        { title: 'Persist mini sidebar expand/collapse state', description: `Mini sidebar expanded/collapsed state:\n- Persist to localStorage: buildos_wizard_sidebar_expanded\n- Read on mount\n- Update on toggle\n\nDo not reset on page reload.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 2, estimated_cost_usd: 0.02 },
        { title: 'Add tooltips to icon-only collapsed sidebar items', description: `When mini sidebar is collapsed, hovering on phase icons should show tooltip:\n- Tooltip: phase title + status\n- Direction: right (tooltip appears to the right of the icon)\n- Delay: 300ms show, 0ms hide\n\nUse a lightweight tooltip implementation (no heavy library needed).\nCSS-based preferred (::after pseudoelement or small tooltip div).`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 3, estimated_cost_usd: 0.03 },
        { title: 'Power Wizard top bar: project name + status chips', description: `The Power Wizard top bar (above the 3 columns) should show:\n- Left: Project name (large, bold) — from server-side prop\n- Center: Status chips (same as current: Idle, agents count, tick count, etc.)\n- Right: Run button + Dashboard link button\n\nRemove the current "SaaS 4 SaaS · Idle" compressed format.\nReplace with cleaner spacing and hierarchy.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 4, estimated_cost_usd: 0.04 },
      ]
    },
    {
      title: 'WS6 — Global Sidebar Redesign (Vercel-style)',
      description: 'Dark premium sidebar with workspace dropdown, clean typography, consistent spacing. Match SaaS standard.',
      order_index: 5,
      tasks: [
        { title: 'Redesign global sidebar to dark Vercel-style', description: `Update apps/web/src/components/layout/Sidebar.tsx:\n\nBackground: #0A0A0A (near black)\nBorder: 1px solid #1F1F1F (subtle separator)\nText: #EDEDED primary, #888888 muted\nActive item: #1A1A1A background + #FFFFFF text + 3px left accent bar (#3B82F6 blue)\nHover: #141414 background\n\nTypography:\n- Section label (CURRENT PROJECT etc.): 10px uppercase, letter-spacing 0.08em, color #888\n- Nav items: 13px, font-weight 450\n- Icons: 16px, color inherits from text\n\nSpacing:\n- Item padding: 8px 12px\n- Section gap: 16px\n- Sidebar width: 220px\n\nSame structure (Projects, Wizard, CURRENT PROJECT section, etc.) but styled dark.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.08 },
        { title: 'Add workspace dropdown (CRITICAL)', description: `CRITICAL FEATURE — workspace switcher at top of sidebar.\n\nPosition: very top of sidebar, above project navigation.\n\nCollapsed view (default):\n  [workspace icon] [Workspace Name] [ChevronDown] (v)\n\nDropdown (click to open):\n  ─────────────────────────\n  ● [Current Workspace Name]  ✓ (active)\n  ─────────────────────────\n  [Other workspace 1]\n  [Other workspace 2]\n  ─────────────────────────\n  + Create workspace\n  ─────────────────────────\n\nData: fetch from GET /api/workspaces (create this route if missing)\nOn switch: navigate to /projects (workspace context changes)\nOn create: open modal or navigate to /workspaces/new\n\nIMPORTANT: This must work with real data from the workspaces table. No mock workspaces.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 2, estimated_cost_usd: 0.10 },
        { title: 'Create GET /api/workspaces route', description: `Create: apps/web/src/app/api/workspaces/route.ts\n\nGET /api/workspaces:\n- Return all workspaces the authenticated user belongs to\n- Query: SELECT w.* FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = auth.uid()\n- OR if no workspace_members table yet: SELECT * FROM workspaces WHERE owner_id = auth.uid()\n- Return: { data: Workspace[] }\n\nPOST /api/workspaces:\n- Create new workspace\n- Params: { name: string }\n- Insert into workspaces table\n- Return created workspace\n\nCheck existing schema for workspace/organization table names before implementing.`, agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 3, estimated_cost_usd: 0.06 },
        { title: 'Fix Settings 404 — create settings route', description: `Settings sidebar link currently → /settings → 404.\n\nFix:\n1. Create apps/web/src/app/(app)/settings/page.tsx\n2. Render a basic settings page with sections:\n   - Profile (name, email — display only)\n   - Workspace (current workspace name, members count)\n   - Billing (placeholder with "Coming soon" if not implemented)\n   - API Keys (placeholder)\n\nOR redirect /settings to /projects if settings is truly not implemented.\nDo NOT leave a 404 — either build the page or redirect gracefully.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 4, estimated_cost_usd: 0.06 },
        { title: 'Update sidebar typography and spacing', description: `Apply consistent design tokens across sidebar:\n\n1. Font: use var(--font-sans) / system-ui (inherit from app)\n2. Reduce visual weight of inactive nav items (font-weight: 400)\n3. Increase active item weight (font-weight: 600)\n4. Add subtle active left border: border-left: 2px solid #3B82F6 on active items\n5. Section headers: uppercase, 10px, letter-spacing 0.1em\n6. Remove any emoji/icon decoration inconsistency\n7. Hover state: smooth 100ms background transition\n\nTest: confirm sidebar looks clean at 1280px and 1440px widths.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 5, estimated_cost_usd: 0.05 },
        { title: 'Add Power Wizard entry CTA to project sidebar', description: `In the CURRENT PROJECT section of the sidebar, add:\n\n  ⚡ Open Power Wizard\n  (replaces the current "Autopilot Mode" sticky link)\n\nStyle: highlighted button-like item, blue accent, positioned before Settings/Sign Out.\nOnClick: navigate to /projects/[id]/wizard\n\nNote: "Power Wizard" is the new name for Autopilot Mode.\nRemove the old sticky "Autopilot Mode" entry if still present.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 6, estimated_cost_usd: 0.03 },
      ]
    },
    {
      title: 'WS7 — Wizard Entry Logic',
      description: 'Power Wizard becomes the natural entry point: auto-open on project creation, Dashboard CTA, phase click nav. Remove manual wizard navigation.',
      order_index: 6,
      tasks: [
        { title: 'Auto-redirect to Power Wizard on project creation', description: `In the project creation flow (Wizard / create project page):\nAfter successful project creation (POST /api/projects returns new projectId):\n  router.push(\`/projects/\${newProjectId}/wizard\`)\n\nDo NOT redirect to the project dashboard.\nThis puts the user immediately into the IRIS wizard for their new project.\n\nIf project creation wizard is multi-step: redirect after LAST step completion.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.04 },
        { title: 'Add "Open Power Wizard" / "Continue Phase" CTA to Dashboard', description: `On the project Dashboard (Command Center overview tab):\n\nAdd a prominent CTA card:\n  If project has active phases: "Continue Phase 1 →" (blue primary button)\n  If no phases but has blueprint: "Open Power Wizard →"\n  If no blueprint: "Start Building →"\n\nPosition: top of content area, before the stat cards.\nStyle: full-width banner card with project status summary + primary action button.\n\nClicking → navigates to /projects/[id]/wizard?phase=[activePhaseId]`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.06 },
        { title: 'Phase click in any context opens wizard at that phase', description: `Any place where a phase is listed (Dashboard, sidebar, Agents page) should link to:\n  /projects/[id]/wizard?phase=[phaseId]\n\nThis replaces any standalone wizard navigation.\nUpdate all hrefs that currently link to /orchestrate or /autopilot to use /wizard.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 3, estimated_cost_usd: 0.04 },
        { title: 'Remove legacy wizard navigation paths', description: `Remove:\n1. /wizard sidebar entry (if it exists as a standalone global item)\n2. Any "Open Wizard" buttons that don't go through /projects/[id]/wizard\n3. The old quick-start sidebar wizard flow if separate from project wizard\n\nKeep:\n- Power Wizard entry via project context (/projects/[id]/wizard)\n- The global /wizard route (Wizard in sidebar) if it's for NEW project creation flow`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 4, estimated_cost_usd: 0.03 },
        { title: 'Add keyboard shortcut for Power Wizard', description: `Register global keyboard shortcut:\n  Cmd/Ctrl + Shift + W → navigate to /projects/[currentProjectId]/wizard\n\nIf no current project: navigate to /projects (project list)\n\nImplement in a global keyboard handler (useEffect at app layout level).\nShow keyboard shortcut hint in sidebar next to Power Wizard entry.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 5, estimated_cost_usd: 0.03 },
      ]
    },
    {
      title: 'WS8 — Context Persistence',
      description: 'projectId, phase, and wizard state persist across routes and page reloads. No "New Project" fallback. Breadcrumb always shows real project.',
      order_index: 7,
      tasks: [
        { title: 'Persist projectId in URL across all navigation', description: `Audit: verify that navigating between any app routes never loses the projectId.\nCheck:\n1. /projects/[id]/wizard → /projects/[id]/tasks: projectId preserved ✓ (URL)\n2. Reload at /projects/[id]/tasks: projectId restored from URL ✓\n3. Wizard → back nav → still on same project ✓\n4. Dashboard button in wizard → /projects/[id] ✓ (not /projects)\n\nFix any case where navigation drops [id] or navigates to /projects without an id.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.04 },
        { title: 'Persist active phase in URL query param', description: `Power Wizard URL pattern: /projects/[id]/wizard?phase=[phaseId]\n\n- Read phase from URL on mount\n- If phase param exists and is valid: set as active phase\n- If no param: use first active phase (or Phase 1)\n- On phase switch: update URL (replace, not push, to avoid back-button clutter)\n\nTest: navigate to /projects/[id]/wizard?phase=[specific_phase_id] → correct phase loads.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.04 },
        { title: 'Wizard state survives page reload', description: `On reload at /projects/[id]/wizard:\n1. projectId: from URL ✓\n2. phaseId: from URL query param ✓\n3. Chat messages: loaded from phases.conversation_history (DB) ✓\n4. Blueprint: fetched from /api/projects/[id]/blueprint ✓\n5. Sidebar expand/collapse: from localStorage ✓\n6. Active right panel tab: from URL ?tab=tasks ✓\n\nVerify all 6 items restore correctly on F5 reload.\nThis is the fix for the P9C bug where reload showed "New Project" wizard.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 3, estimated_cost_usd: 0.06 },
        { title: 'Fix all breadcrumbs to show real project name', description: `Audit all pages for breadcrumb accuracy:\n1. /projects/[id]/wizard → breadcrumb: "SaaS 4 SaaS / Power Wizard"\n2. /projects/[id]/tasks → breadcrumb: "SaaS 4 SaaS / Tasks"\n3. /projects/[id]/agents → breadcrumb: "SaaS 4 SaaS / Agents"\netc.\n\nBreadcrumb component must receive projectName from server-side fetch or context.\nNO fallbacks to "New Project", "Untitled", or project ID string.\n\nFix root: ensure (app)/projects/[id]/layout.tsx fetches project server-side and provides name via context or prop drilling.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 4, estimated_cost_usd: 0.05 },
        { title: 'Add ProjectContext provider to app layout', description: `Create apps/web/src/contexts/ProjectContext.tsx:\n\nContext: { projectId: string, projectName: string, project: Project | null }\n\nProvider: wraps (app)/projects/[id]/layout.tsx children\nData: server-fetched project is passed as prop to client provider\n\nUse context in:\n- Sidebar (current project section)\n- Power Wizard (title, breadcrumb)\n- All pages under /projects/[id]\n\nThis eliminates prop drilling and ensures consistent project identity everywhere.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 5, estimated_cost_usd: 0.07 },
      ]
    },
    {
      title: 'WS9 — Right Panel Real Data Fixes',
      description: 'Connect all 3 tabs to real data. No empty states when data exists. Fix all API envelope issues.',
      order_index: 8,
      tasks: [
        { title: 'Fix Preview tab: store + display deployment URL per project', description: `Projects table must have a preview_url field (or derive from provider_connections).\n\n1. Check projects table schema for preview_url or deployment_url column\n2. If missing: add migration to add preview_url TEXT to projects\n3. For SaaS 4 SaaS: UPDATE projects SET preview_url = 'https://web-lake-one-88.vercel.app' WHERE id = 'feb25dda-6352-42fa-bac8-f4a7104f7b8c'\n4. API GET /api/projects/[id] must return preview_url in response\n5. PreviewTab reads project.preview_url and renders iframe\n\nAcceptance: Preview tab shows live app for SaaS 4 SaaS without manual URL entry.`, agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.05 },
        { title: 'Fix Tasks tab: remove in_progress-only filter', description: `Current bug: Tasks tab only shows in_progress tasks → shows empty for completed projects.\n\nFix in TasksTab.tsx:\n  const { data } = await apiGet(\`/api/projects/\${projectId}/tasks?status=in_progress,ready,completed&limit=50&order=updated_at.desc\`)\n\nOR use the /tasks API without status filter and handle grouping client-side:\n  Show groups: "Active" (in_progress+ready+dispatched) | "Recent" (last 20 completed) | "Blocked"\n\nAcceptance: SaaS 4 SaaS shows 955 completed tasks in "Recent" group, not an empty state.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 2, estimated_cost_usd: 0.06 },
        { title: 'Fix Blueprint tab: correct apiGet envelope unwrap', description: `Blueprint fetch in BlueprintTab.tsx must use:\n  const r = await apiGet<{ data: Blueprint | null }>(\`/api/projects/\${projectId}/blueprint\`)\n  const bp = r.data?.data ?? null\n\nNOT:\n  const bp = r.data  // WRONG — this would be { data: Blueprint } not Blueprint\n\nAfter fixing, test: BlueprintTab for SaaS 4 SaaS must show the real blueprint (not "No blueprint yet").\n\nThis is the P9C-DEBUG fix — ensure it's applied in the new WS4 BlueprintTab component.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 3, estimated_cost_usd: 0.04 },
        { title: 'Remove empty states when data exists', description: `Audit all 3 tabs for false empty states:\n\n1. "No active tasks" when 955 completed tasks exist → REMOVE\n2. "No blueprint yet" when blueprint exists in DB → REMOVE\n3. "No preview URL" when project has deployment → REMOVE\n\nRule: Empty state should only show when the underlying data genuinely does not exist.\nUse the loading state (spinner) while fetching, never show empty state during load.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 4, estimated_cost_usd: 0.04 },
      ]
    },
    {
      title: 'WS10 — Transitions & UX Polish',
      description: 'Smooth entry animations, tab switching, hover states. Premium feel throughout.',
      order_index: 9,
      tasks: [
        { title: 'Power Wizard entry transition: fade + slide', description: `When navigating to /projects/[id]/wizard:\n- Fade in: opacity 0 → 1 over 200ms\n- Slide up: translateY(8px) → translateY(0) over 200ms\n- Easing: ease-out\n\nImplement via:\n1. CSS animation class: animate-wizard-enter\n   @keyframes wizardEnter { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }\n   .animate-wizard-enter { animation: wizardEnter 200ms ease-out forwards; }\n2. Apply to the root container of PowerWizardClient on mount\n\nOr use Framer Motion if already in project:\n  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2 }}`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 1, estimated_cost_usd: 0.04 },
        { title: 'Tab switching animation in right panel', description: `When switching between Preview/Tasks/Blueprint tabs:\n- Outgoing tab: fade out (opacity 1→0, 100ms)\n- Incoming tab: fade in + slide from right (opacity 0→1, translateX(8px)→0, 150ms)\n- Sequential: out first, then in\n\nCSS approach:\n  .tab-content { transition: opacity 150ms ease, transform 150ms ease; }\n  .tab-content.entering { opacity: 1; transform: translateX(0); }\n  .tab-content.exiting { opacity: 0; transform: translateX(-8px); }\n\nOr React state with AnimatePresence if Framer is used.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 2, estimated_cost_usd: 0.04 },
        { title: 'Add hover + active states to all interactive elements', description: `Audit interactive elements in Power Wizard for missing hover/active states:\n\n1. Phase items in mini sidebar: hover bg + cursor-pointer ✓\n2. Tab buttons: hover bg-white/5 ✓\n3. Run button: hover scale(1.02) + brightness(1.1)\n4. Mini sidebar toggle: hover bg-white/5, rotate icon 180° on expand\n5. Chat send button: hover brightness(1.1), active scale(0.97)\n6. Task rows: hover bg-slate-800/40\n\nEnsure all cursors are correct (cursor-pointer for buttons, cursor-text for inputs).`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 3, estimated_cost_usd: 0.04 },
        { title: 'Resize handle between chat and right panel', description: `Add a drag handle between Column 2 (chat) and Column 3 (main panel):\n\n- Visual: 4px wide divider with hover highlight (bg-blue-500/20 on hover)\n- Behavior: drag left/right to resize the panels\n- Min: chat 300px, panel 300px\n- Save to localStorage: buildos_wizard_panel_ratio\n- Restore on reload\n\nImplement with mousedown + mousemove events or use react-resizable-panels library if available.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 4, estimated_cost_usd: 0.06 },
      ]
    },
    {
      title: 'WS11 — Cleanup + Dead Code Removal',
      description: 'Remove duplicate layouts, dead routes, unused components, and legacy Autopilot references after new Power Wizard is live.',
      order_index: 10,
      tasks: [
        { title: 'Remove old AutopilotClient.tsx after PowerWizardClient is live', description: `After WS1 creates PowerWizardClient.tsx and route /wizard:\n\n1. Delete apps/web/src/app/(app)/projects/[id]/autopilot/ directory (if /autopilot is only a redirect)\n2. Delete AutopilotClient.tsx if fully replaced\n3. Delete AutopilotPreviewPanel.tsx if replaced by new RightPanel components (WS4)\n4. Remove AutopilotMiniSidebar.tsx if replaced by new MiniSidebar (WS5)\n5. Clean up any Autopilot type imports\n\nBEFORE deletion: verify all functionality is covered by new components.\nDo NOT delete if any other component still imports from these files.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 1, estimated_cost_usd: 0.03 },
        { title: 'Remove duplicate layout components', description: `Audit for layout duplication:\n1. Check if AppLayout (app)/(app)/layout.tsx renders sidebar in two places\n2. Check if any page-level layouts re-render the global sidebar\n3. Remove any wrapper divs that create double-scroll or z-index conflicts\n4. Ensure only one sidebar component instance exists per page\n\nRun the app after cleanup and verify: no double borders, no double scroll bars, no visual overlap.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 2, estimated_cost_usd: 0.04 },
        { title: 'Clean up all Autopilot string references', description: `After renaming to Power Wizard:\n\nSearch and replace remaining references:\n  grep -r "autopilot\\|Autopilot" apps/web/src --include="*.tsx" --include="*.ts"\n\nReplace:\n- "Autopilot" text → "Power Wizard" (UI strings only)\n- Route strings "/autopilot" → "/wizard"\n- Component names (already done in WS1 but verify)\n\nDo NOT replace:\n- Backend task dispatch logic (autopilot_mode DB columns)\n- Any DB column names\n- Comments that explain history\n\nResult: zero "Autopilot" strings visible in the user-facing UI.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 3, estimated_cost_usd: 0.03 },
        { title: 'Remove dead UI paths and unused routes', description: `Audit and remove:\n1. Any 404 routes that have no page.tsx\n2. Orphaned components not imported anywhere\n3. Old wizard-entry paths that bypass the new flow\n4. Console.log statements added during P9C debugging\n5. TODO/FIXME comments that have been resolved\n\nRun: npx ts-unused-exports tsconfig.json (or equivalent) to find unused exports.\nDo NOT remove anything that is still referenced — focus on genuinely dead code.`, agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 4, estimated_cost_usd: 0.03 },
      ]
    },
  ];

  // ── INSERT WORKSTREAMS + TASKS ───────────────────────────────────────────────
  let totalTasks = 0;
  for (const ws of workstreams) {
    const featureId = randomUUID();
    const feature = await post('features', {
      id: featureId,
      epic_id: epicId,
      project_id: PROJECT_ID,
      title: ws.title,
      description: ws.description,
      status: 'pending',
      priority: 'high',
      order_index: ws.order_index,
      slug: ws.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      acceptance_criteria: [],
    });
    console.log(`  ✅ Feature: ${feature.title}`);

    for (const t of ws.tasks) {
      const taskId = randomUUID();
      const slug = `p9d-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${taskId.slice(0, 4)}`;
      await post('tasks', {
        id: taskId,
        feature_id: featureId,
        project_id: PROJECT_ID,
        title: t.title,
        description: t.description,
        agent_role: t.agent_role,
        status: 'pending',
        task_type: t.task_type,
        priority: t.priority,
        order_index: t.order_index,
        estimated_cost_usd: t.estimated_cost_usd,
        retry_count: 0,
        max_retries: 3,
        failure_count: 0,
        delivery_type: 'generic',
        slug,
        context_payload: {
          phase: '9D',
          source: 'p9d_roadmap',
          epic_title: 'P9D — UX System Refinement + Power Wizard Architecture',
          workstream: ws.title.split(' — ')[0],
          feature_title: ws.title,
          auto_dispatched: true,
        },
      });
      totalTasks++;
    }
    console.log(`    └─ ${ws.tasks.length} tasks seeded`);
  }

  // Update epic with task count
  console.log(`\n✅ P9D SEEDED: ${workstreams.length} workstreams, ${totalTasks} tasks`);
  console.log(`Epic ID: ${epicId}`);
  return epicId;
}

main().catch(console.error);
