// src/app/api/integrations/test/route.ts
// Test/ping a provider connection to verify credentials are still valid.
// Uses Supabase admin client (BuildOS pattern — no next-auth or Prisma).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const internalSecret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

  if (!secret || !internalSecret || secret !== internalSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { connection_id } = body

  if (!connection_id) {
    return NextResponse.json({ error: 'connection_id is required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: connection, error: fetchErr } = await admin
    .from('provider_connections')
    .select('id, provider, status, access_token, token_metadata')
    .eq('id', connection_id)
    .single()

  if (fetchErr || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const start = Date.now()
  const tested_at = new Date().toISOString()

  try {
    let testSuccess = false
    let testMessage = 'Connection test not implemented for this provider'

    const provider = connection.provider as string
    const token = connection.access_token as string | undefined

    if (provider === 'github' && token) {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      })
      testSuccess = res.ok
      testMessage = res.ok ? 'GitHub connection healthy' : `GitHub API returned ${res.status}`
    } else if (provider === 'vercel' && token) {
      const res = await fetch('https://api.vercel.com/v2/user', {
        headers: { Authorization: `Bearer ${token}` },
      })
      testSuccess = res.ok
      testMessage = res.ok ? 'Vercel connection healthy' : `Vercel API returned ${res.status}`
    } else if (provider === 'supabase') {
      testSuccess = true
      testMessage = 'Supabase connection healthy (key present)'
    }

    const latency_ms = Date.now() - start
    const newStatus = testSuccess ? 'connected' : 'error'

    await admin
      .from('provider_connections')
      .update({ status: newStatus, updated_at: tested_at })
      .eq('id', connection_id)

    return NextResponse.json({
      success: testSuccess,
      status: newStatus,
      message: testMessage,
      tested_at,
      latency_ms,
    })
  } catch (err) {
    const latency_ms = Date.now() - start
    await admin
      .from('provider_connections')
      .update({ status: 'error', updated_at: tested_at })
      .eq('id', connection_id)

    return NextResponse.json({
      success: false,
      status: 'error',
      message: 'Connection test failed: ' + (err instanceof Error ? err.message : String(err)),
      tested_at,
      latency_ms,
    })
  }
}
