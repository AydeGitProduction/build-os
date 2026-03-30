/**
 * GET /api/routing/decisions
 *
 * Returns recent routing decisions for a project.
 * Query params: project_id, limit (default 25), offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')
  const limit     = Math.min(parseInt(searchParams.get('limit')  || '25', 10), 100)
  const offset    = Math.max(parseInt(searchParams.get('offset') || '0',  10), 0)

  let query = admin
    .from('routing_decisions')
    .select('*, tasks(title, agent_role)', { count: 'exact' })
    .order('decided_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error: dbError, count } = await query

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ data, total: count })
}
