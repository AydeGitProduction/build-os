/**
 * GET /api/routing/rules
 *
 * Returns all active routing rules ordered by priority.
 * Used by routing panel UI.
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

  const { data, error: dbError } = await admin
    .from('routing_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true })

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
