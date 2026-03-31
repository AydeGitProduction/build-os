/**
 * GET  /api/governance/prevention-rules
 * POST /api/governance/prevention-rules
 *
 * Block G1: Prevention Rules Registry API
 *
 * GET  — Returns all prevention rules (optionally filtered by status/owner_domain).
 * POST — Creates a new prevention rule (admin/internal only).
 *
 * Auth:
 *   GET  — requires authenticated user (anon read via RLS)
 *   POST — requires X-Buildos-Secret (internal/admin only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const owner_domain = searchParams.get('owner_domain') || null

    // Auth: require logged-in user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminSupabaseClient()
    let query = admin
      .from('prevention_rules')
      .select('*')
      .order('rule_code', { ascending: true })

    if (status !== 'all') {
      query = query.eq('status', status)
    }
    if (owner_domain) {
      query = query.eq('owner_domain', owner_domain)
    }

    const { data, error: dbError } = await query

    if (dbError) {
      console.error('[prevention-rules GET] DB error:', dbError.message)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      meta: {
        total: data?.length ?? 0,
        filter_status: status,
        filter_owner_domain: owner_domain ?? 'all',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[prevention-rules GET] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth: X-Buildos-Secret required for writes
    const secret = request.headers.get('X-Buildos-Secret')
    const validSecrets = [
      process.env.BUILDOS_INTERNAL_SECRET,
      process.env.BUILDOS_SECRET,
    ].filter(Boolean)

    if (!secret || !validSecrets.includes(secret)) {
      return NextResponse.json({ error: 'Unauthorized — X-Buildos-Secret required for rule creation' }, { status: 401 })
    }

    const body = await request.json()
    const {
      rule_code,
      title,
      description,
      trigger_condition,
      enforcement_type,
      owner_domain,
      source_bug_id,
      example,
      status = 'active',
    } = body

    // Validate required fields
    const missing: string[] = []
    if (!rule_code)         missing.push('rule_code')
    if (!title)             missing.push('title')
    if (!description)       missing.push('description')
    if (!trigger_condition) missing.push('trigger_condition')
    if (!enforcement_type)  missing.push('enforcement_type')
    if (!owner_domain)      missing.push('owner_domain')
    if (!source_bug_id)     missing.push('source_bug_id')
    if (!example)           missing.push('example')

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate rule_code format
    if (!/^RULE-\d{2,}$/.test(rule_code)) {
      return NextResponse.json(
        { error: 'rule_code must match RULE-XX format (e.g., RULE-01, RULE-24)' },
        { status: 400 }
      )
    }

    const admin = createAdminSupabaseClient()

    const { data, error: dbError } = await admin
      .from('prevention_rules')
      .insert({
        rule_code,
        title,
        description,
        trigger_condition,
        enforcement_type,
        owner_domain,
        source_bug_id,
        example,
        status,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[prevention-rules POST] DB error:', dbError.message)
      // Surface unique constraint violation clearly
      if (dbError.code === '23505') {
        return NextResponse.json(
          { error: `Rule code '${rule_code}' already exists. rule_code must be unique.` },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    console.info(`[prevention-rules POST] Created rule ${rule_code}: ${title}`)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[prevention-rules POST] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
