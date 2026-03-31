/**
 * GET /api/integrations/github/callback
 *
 * GitHub OAuth callback. Exchanges code for access token,
 * fetches GitHub user info, upserts provider_connections row.
 *
 * Requires: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET env vars
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://web-lake-one-88.vercel.app'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations?error=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations?error=missing_params`)
  }

  // Validate CSRF state
  const storedState = req.cookies.get('github_oauth_state')?.value
  const storedUserId = req.cookies.get('github_oauth_user_id')?.value

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations?error=invalid_state`)
  }

  if (!storedUserId) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations?error=session_expired`)
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${APP_URL}/settings/integrations?error=oauth_not_configured`)
  }

  // Exchange code for access token
  let accessToken: string
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`)
    }

    const tokenData = await tokenRes.json()
    if (tokenData.error) {
      throw new Error(tokenData.error_description ?? tokenData.error)
    }
    accessToken = tokenData.access_token
    if (!accessToken) throw new Error('No access token in response')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.redirect(`${APP_URL}/settings/integrations?error=${encodeURIComponent(msg)}`)
  }

  // Fetch GitHub user info
  let githubUser: { id: number; login: string } | null = null
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    })
    githubUser = await userRes.json()
  } catch {
    // Non-fatal — still store connection without user info
  }

  // Upsert provider_connections
  const admin = createAdminSupabaseClient()
  const { error: upsertErr } = await admin
    .from('provider_connections')
    .upsert({
      user_id: storedUserId,
      provider: 'github',
      provider_user_id: githubUser?.id?.toString() ?? null,
      provider_user_login: githubUser?.login ?? null,
      access_token: accessToken,
      scopes: ['read:user', 'repo'],
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider',
    })

  if (upsertErr) {
    return NextResponse.redirect(
      `${APP_URL}/settings/integrations?error=${encodeURIComponent(upsertErr.message)}`
    )
  }

  // Clear state cookies
  const response = NextResponse.redirect(`${APP_URL}/settings/integrations?connected=github`)
  response.cookies.delete('github_oauth_state')
  response.cookies.delete('github_oauth_user_id')

  return response
}
