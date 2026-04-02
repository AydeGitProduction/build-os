// src/app/api/integrations/route.ts
// Lists integration providers and the current workspace's connections.
// Uses Supabase admin client (BuildOS pattern — no next-auth or Prisma).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const internalSecret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET
  const workspaceId = request.nextUrl.searchParams.get('workspace_id')
  const projectId = request.nextUrl.searchParams.get('project_id')

  const isInternal = secret && internalSecret && secret === internalSecret
  if (!isInternal && !projectId && !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminSupabaseClient()

    const { data: providers, error: provErr } = await admin
      .from('integration_providers')
      .select('id, name, slug, description, auth_type, icon_url, is_active')
      .eq('is_active', true)
      .order('name')

    if (provErr) {
      console.warn('[GET /api/integrations] integration_providers:', provErr.message)
      return NextResponse.json({ providers: [], connections: [] })
    }

    let connections: unknown[] = []
    if (workspaceId || projectId) {
      const filter = workspaceId ? { workspace_id: workspaceId } : { project_id: projectId }
      const { data: conns } = await admin
        .from('provider_connections')
        .select('id, provider, status, connected_at, updated_at, workspace_id, project_id')
        .match(filter)
      connections = conns ?? []
    }

    return NextResponse.json({ providers: providers ?? [], connections })
  } catch (err) {
    console.error('[GET /api/integrations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
