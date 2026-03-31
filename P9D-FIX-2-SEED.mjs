// P9D-FIX-2-SEED.mjs
// Sprint: P9D-FIX-2 — Missing Routes, API Stubs, Sidebar Workspace Dropdown
// Purpose: Creates 5 tasks with full code in descriptions to eliminate path ambiguity.
//          Covers every gap identified in P9D that the execution engine failed to create.
// Run: node P9D-FIX-2-SEED.mjs (from repo root, with env vars set)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zyvpoyxdxedcugtdrluc.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ID   = 'feb25dda-6352-42fa-bac8-f4a7104f7b8c'

if (!SERVICE_KEY) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY is not set')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function seed() {
  console.log('🌱  P9D-FIX-2 Sprint Seed Starting…\n')

  // ─── 1. Create epic ──────────────────────────────────────────────────────────
  const epicId = crypto.randomUUID()
  const { error: epicError } = await supabase.from('epics').insert({
    id:          epicId,
    project_id:  PROJECT_ID,
    title:       'P9D-FIX-2 — Missing Routes, API Stubs, Sidebar Dropdown',
    description: 'Creates 5 files that were not created by P9D execution agents: /settings page, wizard redirect, sidebar workspace dropdown, draft-preview API, and iris/exchange API. Each task includes full implementation code so agents have zero ambiguity.',
    status:      'pending',
    slug:        'p9d-fix-2-missing-routes-api',
  })
  if (epicError) {
    console.error('❌  Epic insert failed:', epicError.message)
    process.exit(1)
  }
  console.log(`✅  Epic created: ${epicId}`)

  // ─── 2. Create features (workstreams) ────────────────────────────────────────
  const ws1Id = crypto.randomUUID() // Missing Pages
  const ws2Id = crypto.randomUUID() // Missing API Routes
  const ws3Id = crypto.randomUUID() // Sidebar Enhancement

  const features = [
    {
      id: ws1Id, epic_id: epicId, project_id: PROJECT_ID,
      title: 'WS1 — Missing Page Routes',
      description: 'Creates /settings page and /projects/[id]/wizard page which currently return 404',
      status: 'pending',
      slug: 'p9d-fix-2-ws1-missing-pages',
    },
    {
      id: ws2Id, epic_id: epicId, project_id: PROJECT_ID,
      title: 'WS2 — Missing API Routes (IrisWorkspace)',
      description: 'Creates draft-preview and iris/exchange routes that IrisWorkspace calls but do not exist',
      status: 'pending',
      slug: 'p9d-fix-2-ws2-missing-api',
    },
    {
      id: ws3Id, epic_id: epicId, project_id: PROJECT_ID,
      title: 'WS3 — Sidebar Workspace Dropdown',
      description: 'Adds workspace switcher dropdown to the active Sidebar component',
      status: 'pending',
      slug: 'p9d-fix-2-ws3-sidebar-dropdown',
    },
  ]

  for (const feat of features) {
    const { error } = await supabase.from('features').insert(feat)
    if (error) {
      console.error(`❌  Feature insert failed [${feat.slug}]:`, error.message)
      process.exit(1)
    }
    console.log(`✅  Feature created: ${feat.slug}`)
  }

  // ─── 3. Create tasks ─────────────────────────────────────────────────────────

  const tasks = [

    // ── WS1-T1: Global settings page ──────────────────────────────────────────
    {
      id:          crypto.randomUUID(),
      feature_id:  ws1Id,
      project_id:  PROJECT_ID,
      title:       'Create global /settings page',
      slug:        'p9d-fix-2-ws1-t1-settings-page',
      task_type:   'code',
      agent_role:  'architect',
      priority:    'high',
      status:      'ready',
      description: `CREATE NEW FILE: apps/web/src/app/(app)/settings/page.tsx

CONTEXT:
The /settings route currently returns 404. The sidebar footer in
apps/web/src/components/layout/Sidebar.tsx has a link to /settings (line ~154).
This is the GLOBAL user-level settings page, NOT project settings.
Project settings already exist at apps/web/src/app/(app)/projects/[id]/settings/page.tsx.

CURRENT STATE:
File does not exist. Route /settings returns 404.

IMPLEMENTATION — write this EXACT content to the file:

import { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Settings — Build OS',
}

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-white mb-2">Settings</h1>
      <p className="text-slate-400 text-sm mb-8">Manage your account and workspace preferences.</p>

      {/* Account */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Account
        </h2>
        <div className="bg-slate-900 rounded-lg border border-slate-800 divide-y divide-slate-800">
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Email</p>
              <p className="text-sm text-slate-400 mt-0.5">{user.email}</p>
            </div>
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">User ID</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{user.id}</p>
            </div>
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Account created</p>
              <p className="text-sm text-slate-400 mt-0.5">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Workspace
        </h2>
        <div className="bg-slate-900 rounded-lg border border-slate-800 px-4 py-4">
          <p className="text-sm text-slate-400">
            Workspace settings are managed per-project. Visit a project&apos;s settings
            page to configure integrations, billing, and team members.
          </p>
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">
          Danger Zone
        </h2>
        <div className="bg-slate-900 rounded-lg border border-red-900/40 px-4 py-4">
          <p className="text-sm text-slate-400">
            Account deletion and data export options coming soon.
          </p>
        </div>
      </section>
    </div>
  )
}

VERIFICATION:
- File exists at apps/web/src/app/(app)/settings/page.tsx
- File exports a default async React component
- Route GET /settings returns HTTP 200 (not 404)
- User email is displayed on the page
- Uses createServerSupabaseClient (not createClient) for SSR
- Unauthenticated users are redirected to /login`,
    },

    // ── WS1-T2: Wizard redirect page ──────────────────────────────────────────
    {
      id:          crypto.randomUUID(),
      feature_id:  ws1Id,
      project_id:  PROJECT_ID,
      title:       'Create /projects/[id]/wizard redirect to /autopilot',
      slug:        'p9d-fix-2-ws1-t2-wizard-redirect',
      task_type:   'code',
      agent_role:  'architect',
      priority:    'high',
      status:      'ready',
      description: `CREATE NEW FILE: apps/web/src/app/(app)/projects/[id]/wizard/page.tsx

CONTEXT:
The /projects/[id]/wizard route currently returns 404. This route should redirect to
/projects/[id]/autopilot which is the actual IRIS/Power Wizard page.
The autopilot page already exists at apps/web/src/app/(app)/projects/[id]/autopilot/page.tsx.
The wizard route is a legacy URL or alias — it should just redirect.

CURRENT STATE:
File does not exist. Route /projects/[id]/wizard returns 404.

IMPLEMENTATION — write this EXACT content to the file:

import { redirect } from 'next/navigation'

interface Props {
  params: { id: string }
}

export default function WizardPage({ params }: Props) {
  redirect(\`/projects/\${params.id}/autopilot\`)
}

VERIFICATION:
- File exists at apps/web/src/app/(app)/projects/[id]/wizard/page.tsx
- Navigating to /projects/[id]/wizard redirects to /projects/[id]/autopilot
- No TypeScript errors
- File uses the redirect function from 'next/navigation' (not client-side router)`,
    },

    // ── WS2-T1: draft-preview API route ───────────────────────────────────────
    {
      id:          crypto.randomUUID(),
      feature_id:  ws2Id,
      project_id:  PROJECT_ID,
      title:       'Create GET /api/projects/[id]/draft-preview route',
      slug:        'p9d-fix-2-ws2-t1-draft-preview-api',
      task_type:   'code',
      agent_role:  'architect',
      priority:    'high',
      status:      'ready',
      description: `CREATE NEW FILE: apps/web/src/app/api/projects/[id]/draft-preview/route.ts

CONTEXT:
IrisWorkspace (apps/web/src/components/iris/IrisWorkspace.tsx, line 45) calls
GET /api/projects/[id]/draft-preview on mount and after each IRIS reply.
This route does NOT exist — causing a 404 error on every workspace load.

The route must return:
  { data: IrisPreviewData | null }
where IrisPreviewData matches the type defined in apps/web/src/types/iris.ts:
  {
    product_name?: string | null
    problem_statement?: string | null
    target_audience?: string | null
    phases: IrisPreviewPhase[]
    assumptions: string[]
    is_partial: boolean
  }

The implementation should:
1. Fetch the project's blueprint from the blueprints table (if it exists)
2. Fetch the project's phases and tasks to build the phases array
3. Return null data if no blueprint exists yet (means IRIS discovery is pending)
4. Return populated data if blueprint exists (means IRIS has already run)

CURRENT STATE:
File does not exist. GET /api/projects/[id]/draft-preview returns 404.

IMPLEMENTATION — write this EXACT content to the file:

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin    = createAdminSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the project blueprint (if it exists)
    const { data: blueprint } = await admin
      .from('blueprints')
      .select('id, title, problem_statement, target_audience, content, status')
      .eq('project_id', params.id)
      .maybeSingle()

    // If no blueprint, return null data (IRIS discovery not yet complete)
    if (!blueprint) {
      return NextResponse.json({ data: null })
    }

    // Fetch phases for this project
    const { data: phases } = await admin
      .from('phases')
      .select('id, name, description, order, tasks(id, title, description, estimated_hours)')
      .eq('project_id', params.id)
      .order('order', { ascending: true })

    const previewData = {
      product_name:       blueprint.title ?? null,
      problem_statement:  blueprint.problem_statement ?? null,
      target_audience:    blueprint.target_audience ?? null,
      phases: (phases ?? []).map((p: any) => ({
        id:          p.id,
        name:        p.name,
        description: p.description ?? undefined,
        order:       p.order ?? undefined,
        tasks: (p.tasks ?? []).map((t: any) => ({
          id:               t.id,
          title:            t.title,
          description:      t.description ?? undefined,
          estimated_hours:  t.estimated_hours ?? undefined,
        })),
      })),
      assumptions: [],
      is_partial:  blueprint.status !== 'confirmed',
    }

    return NextResponse.json({ data: previewData })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[draft-preview] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

VERIFICATION:
- File exists at apps/web/src/app/api/projects/[id]/draft-preview/route.ts
- GET /api/projects/[id]/draft-preview returns HTTP 200 (not 404)
- Returns { data: null } when no blueprint exists for the project
- Returns { data: { product_name, phases, ... } } when blueprint exists
- IrisWorkspace stops showing console 404 errors for draft-preview`,
    },

    // ── WS2-T2: iris/exchange API route ───────────────────────────────────────
    {
      id:          crypto.randomUUID(),
      feature_id:  ws2Id,
      project_id:  PROJECT_ID,
      title:       'Create POST /api/projects/[id]/iris/exchange route',
      slug:        'p9d-fix-2-ws2-t2-iris-exchange-api',
      task_type:   'code',
      agent_role:  'architect',
      priority:    'high',
      status:      'ready',
      description: `CREATE NEW FILE: apps/web/src/app/api/projects/[id]/iris/exchange/route.ts

CONTEXT:
IrisWorkspace (apps/web/src/components/iris/IrisWorkspace.tsx, line 110) calls
POST /api/projects/[id]/iris/exchange with body { message: string }.
It expects the response to have { reply: string } or { message: string }.
This route does NOT exist — causing IRIS chat to fail with a 404 error.

The existing IRIS conversation endpoint is at:
  apps/web/src/app/api/projects/[id]/iris/route.ts (POST)
That route accepts { message, history } and returns { reply, complete, history }.

The exchange route is a NEW SUBDIRECTORY under iris/. The existing iris/route.ts
handles POST /api/projects/[id]/iris. This new file handles
POST /api/projects/[id]/iris/exchange — they are different routes.

IMPORTANT: Create this file at:
  apps/web/src/app/api/projects/[id]/iris/exchange/route.ts
NOT at iris/route.ts (which already exists).

CURRENT STATE:
File does not exist. POST /api/projects/[id]/iris/exchange returns 404.

IMPLEMENTATION — write this EXACT content to the file:

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXCHANGE_SYSTEM_PROMPT = \`You are IRIS, the AI architect for Build OS.
You are currently in conversation with the user about their project.
You help them plan, refine, and execute their software product vision.
Keep responses concise and actionable. Ask follow-up questions when needed.
Do NOT use markdown formatting — plain conversational text only.\`

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin    = createAdminSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project } = await admin
      .from('projects')
      .select('id, name, project_type')
      .eq('id', params.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const { message } = body as { message: string }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     EXCHANGE_SYSTEM_PROMPT + \`\\n\\nProject: "\${project.name}" (type: \${project.project_type})\`,
      messages:   [{ role: 'user', content: message.trim() }],
    })

    const reply = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    return NextResponse.json({ reply })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[iris/exchange] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

VERIFICATION:
- File exists at apps/web/src/app/api/projects/[id]/iris/exchange/route.ts
- File is in a SUBDIRECTORY of iris/ (NOT replacing iris/route.ts)
- POST /api/projects/[id]/iris/exchange returns HTTP 200 (not 404)
- Response body contains { reply: string }
- IrisWorkspace chat messages now work without console 404 errors`,
    },

    // ── WS3-T1: Sidebar workspace dropdown ────────────────────────────────────
    {
      id:          crypto.randomUUID(),
      feature_id:  ws3Id,
      project_id:  PROJECT_ID,
      title:       'Add workspace dropdown to layout/Sidebar.tsx',
      slug:        'p9d-fix-2-ws3-t1-sidebar-workspace-dropdown',
      task_type:   'code',
      agent_role:  'architect',
      priority:    'high',
      status:      'ready',
      description: `MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx

IMPORTANT — READ THIS FIRST:
There are TWO Sidebar files in this codebase:
1. apps/web/src/components/layout/Sidebar.tsx  ← THIS IS THE ACTIVE ONE (modify this)
2. apps/web/src/components/Sidebar.tsx         ← ORPHANED, never imported, DO NOT touch

The active sidebar is imported by AppShell:
  import Sidebar from '@/components/layout/Sidebar'

CONTEXT:
The current sidebar (apps/web/src/components/layout/Sidebar.tsx) has:
- Logo + "Build OS" label in header
- TOP_NAV links (Projects, Wizard)
- Optional project-scoped nav (collapsible)
- Autopilot Mode link (when projectId present)
- Footer with Settings link and Sign Out button

The sidebar is missing a workspace switcher, which is needed for the
Integrations section to work correctly (FIX-02 from P9D audit).

CURRENT STATE:
File exists with ~170 lines. No workspace state or dropdown present.
Current imports (line 1-13) include: useState, Link, usePathname,
various lucide icons including ChevronDown, ChevronRight, and useRouter.

IMPLEMENTATION:
Make the following precise additions to the file. Do NOT remove any existing code.

STEP 1 — Add WorkspaceSwitcher state at the top of the Sidebar function
(insert after line 55, after the existing useState declarations):

  const [workspaces, setWorkspaces] = useState<Array<{id: string, name: string, slug: string}>>([])
  const [currentWs, setCurrentWs]   = useState<string>('Build OS')
  const [wsOpen, setWsOpen]          = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.data?.length) {
          setWorkspaces(d.data)
          setCurrentWs(d.data[0].name)
        }
      })
      .catch(() => {/* silently ignore — workspaces are optional */})
  }, [])

STEP 2 — Add the useEffect to the existing React import at line 3:
  import React, { useState, useEffect } from 'react'
  (It currently only imports useState — add useEffect)

STEP 3 — Insert the WorkspaceSwitcher block in the JSX.
Insert it INSIDE the <aside> element, AFTER the closing </div> of the logo section
(after the line that has "Build OS" text, approximately line 78), and BEFORE the
opening <nav> tag.

Insert this block:
      {/* ── Workspace Switcher ────────────────────────────────────────── */}
      <div className="relative px-3 py-2 border-b border-white/10">
        <button
          onClick={() => setWsOpen(v => !v)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-600 text-white text-xs font-bold shrink-0">
            {currentWs.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 truncate text-left">{currentWs}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', wsOpen && 'rotate-180')} />
        </button>
        {wsOpen && workspaces.length > 1 && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md border border-white/10 bg-navy-900 shadow-lg overflow-hidden">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => { setCurrentWs(ws.name); setWsOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded bg-brand-600 text-white text-xs font-bold shrink-0">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

VERIFICATION:
- File is at apps/web/src/components/layout/Sidebar.tsx (the layout/ subdirectory version)
- useEffect is added to the React import
- WorkspaceSwitcher state variables are declared inside Sidebar function
- Workspace dropdown block is visible in the sidebar between logo and nav
- Existing nav items (Projects, Wizard, project-scoped nav, Autopilot, footer) are UNCHANGED
- No TypeScript errors
- clicking the workspace name toggles the dropdown open/closed`,
    },
  ]

  // ─── Insert tasks ──────────────────────────────────────────────────────────
  console.log('\n📝  Inserting tasks…')
  for (const task of tasks) {
    const { error } = await supabase.from('tasks').insert(task)
    if (error) {
      console.error(`❌  Task insert failed [${task.slug}]:`, error.message)
      process.exit(1)
    }
    console.log(`✅  Task inserted: ${task.slug}`)
  }

  console.log('\n🚀  P9D-FIX-2 Sprint seeded successfully!')
  console.log(`   Epic ID:   ${epicId}`)
  console.log(`   Tasks:     ${tasks.length}`)
  console.log(`   Workstreams: WS1 (2 missing pages), WS2 (2 missing API routes), WS3 (1 sidebar update)`)
  console.log('\n⏳  Tasks are status=ready and will be auto-dispatched by the next orchestration tick.')
  console.log('    Or dispatch manually via: POST /api/dispatch/task with each task ID.')
}

seed().catch(err => {
  console.error('❌  Unexpected error:', err)
  process.exit(1)
})
