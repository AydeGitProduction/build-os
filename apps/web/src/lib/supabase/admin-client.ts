// src/lib/supabase/admin-client.ts
//
// Canonical admin client barrel.
// Exports the AdminClient type and factory used by ownership resolvers
// and provisioning services.
//
// NOTE: Never import this in browser/Client Components — it uses the
// service role key and must only be called from server-side code.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

/**
 * AdminClient — Supabase client with service-role privileges.
 * Created via createAdminClient(); all callers should accept this type
 * as a parameter rather than constructing their own client.
 */
export type AdminClient = ReturnType<typeof createClient<Database>>

let _singleton: AdminClient | null = null

/**
 * Returns a singleton admin Supabase client.
 * Bypasses RLS — only use in API routes with manual auth checks.
 */
export function createAdminClient(): AdminClient {
  if (_singleton) return _singleton

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '[supabase/admin-client] Missing required env vars: ' +
        'NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  _singleton = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return _singleton
}
