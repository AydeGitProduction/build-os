import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/workspaces — list workspaces for the current user's org
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select(`
        id, name, slug, description, created_at, updated_at,
        organization:organizations(id, name, slug)
      `)
      .order('name')

    if (error) throw error

    return NextResponse.json({ data: workspaces })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/workspaces — create a new workspace
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, organization_id } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
    }
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    // Generate slug from name
    const slug = name.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), slug, description: description?.trim() || null, organization_id })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A workspace with this name already exists' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ data: workspace }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
