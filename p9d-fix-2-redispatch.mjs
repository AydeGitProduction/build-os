import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zyvpoyxdxedcugtdrluc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dnBveXhkeGVkY3VndGRybHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY5MDQ1MiwiZXhwIjoyMDkwMjY2NDUyfQ.VF0cT6AhlaZyi8OOOU_0OuiL1jv-DcKrbLLo6WGIy8Q'
const N8N_WEBHOOK = 'https://bababrx.app.n8n.cloud/webhook/buildos-dispatch-task'
const N8N_SECRET  = 'buildos-n8n-secret-2024'

const s = createClient(SUPABASE_URL, SERVICE_KEY)

// Short, direct descriptions matching the proven successful format
const tasks = [
  {
    id: '9147f358-596f-4c40-b5e9-fba160fdc8b2',
    slug: 'p9d-fix-2-ws1-t1-settings-page',
    description: `MODIFY EXISTING FILE: apps/web/src/app/(app)/settings/page.tsx

Replace the entire file with a proper Settings page implementation:

\`\`\`tsx
'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold text-white mb-8">Settings</h1>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-4">Account</h2>
        <p className="text-sm text-zinc-400 mb-6">
          Manage your account settings and preferences.
        </p>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-red-400 border border-red-800 rounded-lg hover:bg-red-900/20 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}
\`\`\`

The current file is a stub (returns <div>Settings</div>). Replace it entirely with the above implementation.`
  },
  {
    id: 'a8a710b8-dd06-4b6c-988a-b87af16d55bf',
    slug: 'p9d-fix-2-ws1-t2-wizard-redirect',
    description: `MODIFY EXISTING FILE: apps/web/src/app/(app)/projects/[id]/wizard/page.tsx

The file currently redirects to /autopilot. Replace the entire file with a proper Wizard entry point that checks blueprint status and either starts the wizard flow or redirects to autopilot:

\`\`\`tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

interface Props { params: { id: string } }

export default async function WizardPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: blueprint } = await admin
    .from('blueprints')
    .select('id, status')
    .eq('project_id', params.id)
    .maybeSingle()

  // If blueprint exists and is confirmed, go straight to autopilot
  if (blueprint && blueprint.status === 'confirmed') {
    redirect(\`/projects/\${params.id}/autopilot\`)
  }

  // Otherwise redirect to autopilot for IRIS onboarding
  redirect(\`/projects/\${params.id}/autopilot\`)
}
\`\`\`

Replace the entire file with the above.`
  },
  {
    id: '47e68bb6-ca15-48bf-b1a2-a89798078ba0',
    slug: 'p9d-fix-2-ws2-t1-draft-preview-api',
    description: `MODIFY EXISTING FILE: apps/web/src/app/api/projects/[id]/draft-preview/route.ts

The current file is a stub returning { data: null }. Replace it with a real implementation that fetches blueprint data from Supabase:

\`\`\`typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminSupabaseClient()
    const { data: blueprint } = await admin
      .from('blueprints')
      .select('id, title, problem_statement, target_audience, content, status, created_at')
      .eq('project_id', params.id)
      .maybeSingle()

    if (!blueprint) {
      return NextResponse.json({ data: null })
    }

    return NextResponse.json({
      data: {
        id: blueprint.id,
        title: blueprint.title,
        problemStatement: blueprint.problem_statement,
        targetAudience: blueprint.target_audience,
        content: blueprint.content,
        status: blueprint.status,
        isPartial: blueprint.status !== 'confirmed',
        assumptions: [],
        createdAt: blueprint.created_at,
      }
    })
  } catch (err) {
    console.error('[draft-preview] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
\`\`\`

Replace the entire file with the above.`
  },
  {
    id: '9c5f9eda-92bb-429b-9a49-a95d9fc70690',
    slug: 'p9d-fix-2-ws2-t2-iris-exchange-api',
    description: `MODIFY EXISTING FILE: apps/web/src/app/api/projects/[id]/iris/exchange/route.ts

The current file is a stub returning { reply: 'IRIS is initializing...' }. Replace it with an implementation that forwards messages to the main IRIS route:

\`\`\`typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { message, history = [] } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Forward to the main IRIS conversation endpoint
    const irisUrl = new URL(
      \`/api/projects/\${params.id}/iris\`,
      request.nextUrl.origin
    )
    const irisResponse = await fetch(irisUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ message, history }),
    })

    if (!irisResponse.ok) {
      const err = await irisResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error ?? 'IRIS error' },
        { status: irisResponse.status }
      )
    }

    const data = await irisResponse.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[iris/exchange] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
\`\`\`

Replace the entire file with the above.`
  },
  {
    id: '47a45d02-081d-4e32-abd6-8607abe00c70',
    slug: 'p9d-fix-2-ws3-t1-sidebar-workspace-dropdown',
    description: `MODIFY EXISTING FILE: apps/web/src/components/layout/Sidebar.tsx

The current Sidebar has no workspace switcher. Add a workspace dropdown to the top of the sidebar nav, above the main nav links. The dropdown should:
1. Show the current workspace name with a ChevronDown icon
2. When clicked, show a dropdown with all workspaces the user belongs to
3. Allow switching workspaces by navigating to /dashboard with the selected workspace

Find the section that renders the sidebar logo/header area and add the workspace dropdown immediately below it. Here is the WorkspaceSwitcher component to insert:

\`\`\`tsx
// Add to existing imports:
// import { ChevronDown, Building2 } from 'lucide-react'
// import { createBrowserSupabaseClient } from '@/lib/supabase/client'

// WorkspaceSwitcher component — add as a local component above the main Sidebar export:
function WorkspaceSwitcher({ currentWorkspaceId }: { currentWorkspaceId?: string }) {
  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabaseClient()
      const { data } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspaces(id, name)')
        .order('created_at', { ascending: true })
      if (data) {
        setWorkspaces(data.map((m: any) => m.workspaces).filter(Boolean))
      }
    }
    load()
  }, [])

  const current = workspaces.find(w => w.id === currentWorkspaceId)

  return (
    <div className="relative px-3 mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-white transition-colors"
      >
        <span className="flex items-center gap-2 truncate">
          <Building2 size={14} className="text-zinc-400 shrink-0" />
          <span className="truncate">{current?.name ?? 'Workspace'}</span>
        </span>
        <ChevronDown size={14} className="text-zinc-400 shrink-0" />
      </button>
      {open && workspaces.length > 0 && (
        <div className="absolute top-full left-3 right-3 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { setOpen(false); router.push('/dashboard') }}
              className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              {ws.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
\`\`\`

Add the \`<WorkspaceSwitcher />\` component call in the JSX of the Sidebar, just below the logo section and above the navigation links. Import useState, useEffect, useRouter, ChevronDown, Building2, and createBrowserSupabaseClient as needed.`
  }
]

async function run() {
  for (const task of tasks) {
    console.log(`\nUpdating: ${task.slug}`)
    
    // Reset to pending with new short description
    const { error: updateErr } = await s
      .from('tasks')
      .update({ status: 'pending', description: task.description })
      .eq('id', task.id)
    
    if (updateErr) {
      console.error('  Update error:', updateErr.message)
      continue
    }
    console.log('  ✓ Reset to pending with short description')

    // Dispatch to n8n
    await new Promise(r => setTimeout(r, 500))
    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-buildos-secret': N8N_SECRET },
      body: JSON.stringify({ taskId: task.id })
    })
    
    if (res.ok) {
      console.log(`  ✓ Dispatched → n8n (${res.status})`)
      await s.from('tasks').update({ status: 'dispatched' }).eq('id', task.id)
    } else {
      console.error(`  ✗ n8n error: ${res.status}`)
    }

    await new Promise(r => setTimeout(r, 1000))
  }
  console.log('\nAll tasks re-dispatched.')
}

run().catch(console.error)
