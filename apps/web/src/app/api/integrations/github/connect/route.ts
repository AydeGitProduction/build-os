/**
 * GET /api/integrations/github/connect
 *
 * Initiates GitHub OAuth flow. Redirects to GitHub authorization URL.
 * Generates CSRF state token stored in a cookie.
 *
 * Requires: GITHUB_CLIENT_ID env var
 * Auth: Bearer JWT (user must be logged in)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  // Verify user is logged in
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized — please log in first' }, { status: 401 })
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'GitHub OAuth not configured — GITHUB_CLIENT_ID missing' },
      { status: 503 }
    )
  }

  // Generate CSRF state
  const state = randomBytes(20).toString('hex')
  const callbackUrl = process.env.GITHUB_CALLBACK_URL
    ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://web-lake-one-88.vercel.app'}/api/integrations/github/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'read:user,repo',
    state,
  })

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`

  // Store state in cookie for CSRF validation
  const response = NextResponse.redirect(githubAuthUrl)
  response.cookies.set('github_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  // Store user_id in cookie so callback knows who to associate connection with
  response.cookies.set('github_oauth_user_id', user.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
