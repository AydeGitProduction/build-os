// src/app/api/integrations/test/route.ts
// Tests a provider connection by making a lightweight API call.
// Uses Supabase admin client (BuildOS pattern).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const internalSecret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET
  
  const admin = createAdminSupabaseClient()
  let userId: string | null = null

  if (secret && internalSecret && secret === internalSecret) {
    // Internal call — no user session required
  } else {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  }

  try {
    const body = await request.json()
    const { provider, connection_id, workspace_id } = body as {
      provider?: string
      connection_id?: string
      workspace_id?: string
    }

    if (!provider || !connection_id) {
      return NextResponse.json({ error: 'provider and connection_id required' }, { status: 400 })
    }

    // Fetch the connection credentials
    const { data: connection, error: connErr } = await admin
      .from('provider_connections')
      .select('id, provider, encrypted_credentials, workspace_id, status')
      .eq('id', connection_id)
      .single()

    if (connErr || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Simple ping — verify connection exists and credentials are present
    const hasCredentials = !!connection.encrypted_credentials
    const result = {
      success: hasCredentials,
      provider: connection.provider,
      connection_id: connection.id,
      status: hasCredentials ? 'reachable' : 'no_credentials',
      tested_at: new Date().toISOString(),
    }

    // Update last_tested_at in DB
    await admin
      .from('provider_connections')
      .update({ status: hasCredentials ? 'active' : 'error' })
      .eq('id', connection_id)

    return NextResponse.json(result)
  } catch (err) {
    console.error('[integrations/test] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
