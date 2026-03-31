import { randomUUID } from 'crypto';

const SUPABASE_URL = 'https://zyvpoyxdxedcugtdrluc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dnBveXhkeGVkY3VndGRybHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY5MDQ1MiwiZXhwIjoyMDkwMjY2NDUyfQ.VF0cT6AhlaZyi8OOOU_0OuiL1jv-DcKrbLLo6WGIy8Q';
const PROJECT_ID = 'feb25dda-6352-42fa-bac8-f4a7104f7b8c';
const WORKSPACE_ID = 'c06ebfbd-70e7-4a43-b0bc-ac0e68746f41';

const headers = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Prefer': 'return=representation',
};

async function post(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(`POST ${path} failed: ${JSON.stringify(d)}`);
  return Array.isArray(d) ? d[0] : d;
}

async function run() {
  // ── Create epic ──────────────────────────────────────────────────────────
  const epicId = randomUUID();
  await post('epics', {
    id: epicId,
    project_id: PROJECT_ID,

    title: 'P9D-FIX — Integration Wiring Corrections',
    description: `Root cause fix for P9D deployment gaps.

DIAGNOSIS: P9D agents created new files at WRONG PATHS instead of modifying the EXISTING files that are actually imported by the app. All tasks in this epic must MODIFY EXISTING FILES — never create parallel files.

Key root cause:
- Agent created components/Sidebar.tsx (wrong) instead of modifying components/layout/Sidebar.tsx (correct — what AppShell imports)
- Agent created components/PowerWizardClient.tsx (not imported) instead of modifying iris/IrisWorkspace.tsx
- Agent created project settings (wrong) instead of global settings page

This epic fixes each gap at the correct file.`,

    status: 'in_progress',
    slug: 'p9d-fix-integration-wiring',
    priority: 'critical',
  });
  console.log(`✅ Epic: ${epicId}`);

  // ── Create feature ───────────────────────────────────────────────────────
  const featureId = randomUUID();
  await post('features', {
    id: featureId,
    project_id: PROJECT_ID,
    epic_id: epicId,
    title: 'P9D-FIX — Precise Integration Corrections',
    description: 'Fix all integration gaps from P9D by modifying the correct existing files.',
    status: 'in_progress',
    slug: 'p9d-fix-integration-wiring',
    priority: 'critical',
  });
  console.log(`✅ Feature: ${featureId}`);

  // ── Tasks ────────────────────────────────────────────────────────────────
  const tasks = [
    {
      title: 'FIX-01: Add blueprint existence check to IrisWorkspace.tsx on mount',
      priority: 'critical',
      task_type: 'code',
      agent_role: 'frontend_engineer',
      description: `MODIFY EXISTING FILE: apps/web/src/components/iris/IrisWorkspace.tsx
DO NOT create a new file. DO NOT create PowerWizardClient.tsx. Modify IrisWorkspace.tsx directly.

EXACT LOCATION: Find the comment "// ── Restore session from localStorage" (around line 181).
Add a NEW useEffect AFTER that localStorage effect block (after the closing "}, [projectId])" of that effect).

INSERT THIS EXACT CODE after the localStorage restore useEffect:

  // ── FIX-01: Check for existing blueprint on mount ─────────────────────────
  // If a blueprint already exists for this project, skip onboarding immediately.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const checkExistingBlueprint = async () => {
      try {
        const r = await fetch(\`/api/projects/\${projectId}/blueprint\`)
        if (!r.ok) return
        const d = await r.json()
        // Server returns { data: blueprint } — apiGet wraps as { data: { data: blueprint } }
        const bp: Blueprint | null = d.data?.blueprint_features
          ? d.data
          : d.data?.data?.blueprint_features
          ? d.data.data
          : null
        if (!bp || !bp.blueprint_features?.length) return
        if (cancelled) return
        setBlueprint(bp)
        setReadiness(100)
        setIrisComplete(true)
        setPreviewData(blueprintToPreview(bp, {}))
      } catch { /* non-fatal */ }
    }
    checkExistingBlueprint()
    return () => { cancelled = true }
  }, [projectId])

VERIFICATION: After deploying, navigate to /projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/autopilot.
The header should show "IRIS / SaaS 4 SaaS" (real project name) NOT "IRIS / New Project".
The right panel should show the blueprint, not "No blueprint yet".`,
    },
    {
      title: 'FIX-03: Create global settings page at app/(app)/settings/page.tsx',
      priority: 'critical',
      task_type: 'code',
      agent_role: 'frontend_engineer',
      description: `CREATE NEW FILE: apps/web/src/app/(app)/settings/page.tsx
This file does NOT exist yet. The global /settings route returns 404.
DO NOT edit apps/web/src/app/(app)/projects/[id]/settings/page.tsx — that is project-level settings, already exists.

CREATE the file at this EXACT path: apps/web/src/app/(app)/settings/page.tsx

Content requirements:
1. Must be a Next.js Server Component (no 'use client')
2. Must import createServerSupabaseClient and redirect from next/navigation
3. Must redirect to /login if no user session
4. Must export metadata with title: 'Settings — Build OS'
5. Must render a page with sections: Account (user email display), Connected Services (GitHub + Vercel connected status), and a Sign out button
6. Use Tailwind classes matching the existing app style (white bg, gray borders, rounded-lg sections)

VERIFICATION: After deploying, navigate to /settings in the app.
Should render a Settings page — NOT a 404.
The sidebar Settings link should work.`,
    },
    {
      title: 'FIX-02: Add workspace dropdown to components/layout/Sidebar.tsx (NOT components/Sidebar.tsx)',
      priority: 'critical',
      task_type: 'code',
      agent_role: 'frontend_engineer',
      description: `MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx
THIS IS THE CORRECT FILE — it is what AppShell.tsx imports. Do NOT touch apps/web/src/components/Sidebar.tsx (wrong path, not imported).

STEP 1 — Add useEffect and useState for workspaces.
Add to imports: useEffect (already imported via useState — add if missing)
Add new state: const [workspaces, setWorkspaces] = useState<Array<{id:string,name:string}>>([])
Add new state: const [wsOpen, setWsOpen] = useState(false)

Add this useEffect inside the Sidebar component (after existing state declarations):
  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data)) setWorkspaces(d.data) })
      .catch(() => {})
  }, [])

STEP 2 — Add workspace dropdown UI.
Find the Logo section (the div with className containing "h-14 items-center"). 
INSERT a workspace dropdown AFTER the Logo div, BEFORE the <nav> element:

  {/* Workspace dropdown */}
  <div className="relative px-3 pb-2 border-b border-white/10">
    <button
      onClick={() => setWsOpen(v => !v)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors"
    >
      <LayoutGrid className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="flex-1 truncate text-left">{workspaces[0]?.name ?? 'Workspace'}</span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
    </button>
    {wsOpen && workspaces.length > 0 && (
      <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md border border-white/10 bg-slate-900 shadow-lg py-1">
        {workspaces.map(ws => (
          <div key={ws.id} className="px-3 py-2 text-sm text-slate-300 hover:bg-white/5 cursor-pointer truncate">
            {ws.name}
          </div>
        ))}
      </div>
    )}
  </div>

VERIFICATION: After deploying, open the sidebar. Below the "Build OS" logo, there should be a clickable workspace dropdown showing the current workspace name.`,
    },
    {
      title: 'FIX-04: Create /projects/[id]/wizard redirect to /projects/[id]/autopilot',
      priority: 'high',
      task_type: 'code',
      agent_role: 'frontend_engineer',
      description: `CREATE NEW FILE: apps/web/src/app/(app)/projects/[id]/wizard/page.tsx
This makes /projects/[id]/wizard work (currently 404) by redirecting to /projects/[id]/autopilot.

CREATE the file at: apps/web/src/app/(app)/projects/[id]/wizard/page.tsx

Content:
import { redirect } from 'next/navigation'

interface Props {
  params: { id: string }
}

export default function WizardRedirectPage({ params }: Props) {
  redirect(\`/projects/\${params.id}/autopilot\`)
}

This is a simple redirect — the full wizard re-architecture will come in P9E.
For now, /wizard and /autopilot both point to the same experience.

VERIFICATION: Navigate to /projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/wizard
Should immediately redirect to /projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c/autopilot (not 404).`,
    },
    {
      title: 'FIX-05: Wire DashboardCTABanner into project dashboard page',
      priority: 'high',
      task_type: 'code',
      agent_role: 'frontend_engineer',
      description: `MODIFY EXISTING FILE: apps/web/src/app/(app)/projects/[id]/page.tsx
The DashboardCTABanner component was created at apps/web/src/components/dashboard/DashboardCTABanner.tsx
but it is NOT imported or used in the actual dashboard page.

STEP 1: Add import at top of apps/web/src/app/(app)/projects/[id]/page.tsx:
import DashboardCTABanner from '@/components/dashboard/DashboardCTABanner'

STEP 2: Find where the CommandCenter component is rendered in the JSX.
It will look something like: <CommandCenter ... />

INSERT the DashboardCTABanner BEFORE the CommandCenter:
<DashboardCTABanner projectId={params.id} projectName={project.name} />

The DashboardCTABanner shows a "Open Power Wizard" / "Continue Phase" CTA at the top of the dashboard.

IMPORTANT: Check the DashboardCTABanner component props first (read the file) to ensure you pass the correct props.

VERIFICATION: Navigate to /projects/feb25dda-6352-42fa-bac8-f4a7104f7b8c — the dashboard should show a CTA banner above the stats cards.`,
    },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const taskId = randomUUID();
    await post('tasks', {
      id: taskId,
      project_id: PROJECT_ID,
      feature_id: featureId,
      title: t.title,
      description: t.description,
      task_type: t.task_type,
      agent_role: t.agent_role,
      priority: t.priority,
      status: 'ready',
      context_payload: { phase: 'P9D-FIX', source: 'p9d_integration_fix', epic: 'P9D-FIX' },
      slug: `p9d-fix-${i + 1}-${taskId.slice(0, 6)}`,
      order_index: i,
    });
    console.log(`  ✅ Task ${i+1}/5: ${t.title.slice(0,60)}...`);
  }

  // ── Trigger dispatch ─────────────────────────────────────────────────────
  const dispatchRes = await fetch('https://bababrx.app.n8n.cloud/webhook/buildos-dispatch-task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-buildos-secret': 'fbdc1467fcb75e068ef3f0976bf132934cba8a75e3adb24d2cd580a437eb532b',
    },
    body: JSON.stringify({ project_id: PROJECT_ID, epic_id: epicId, mode: 'batch' }),
  });
  console.log(`\n🚀 Dispatch: HTTP ${dispatchRes.status}`);
  console.log(`\n📋 SUMMARY`);
  console.log(`   Epic:    ${epicId}`);
  console.log(`   Feature: ${featureId}`);
  console.log(`   Tasks:   5`);
  console.log(`   Status:  ALL ready → dispatching`);
}

run().catch(e => { console.error('SEED FAILED:', e); process.exit(1); });
