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
    const irisUrl = new URL(
      `/api/projects/${params.id}/iris`,
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
      return NextResponse.json({ error: err.error ?? 'IRIS error' }, { status: irisResponse.status })
    }
    const data = await irisResponse.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[iris/exchange] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
