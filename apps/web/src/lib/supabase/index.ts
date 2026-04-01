// src/lib/supabase/index.ts
// Barrel export — provides the browser-side Supabase singleton used by hooks
// (e.g. useRealtimeTasks) that import `from '../lib/supabase'`

import { createClient } from './client'

/**
 * Browser-side Supabase singleton.
 * Safe to use in 'use client' components and hooks.
 * For server components / API routes, use createServerSupabaseClient() from ./server instead.
 */
export const supabase = createClient()

// Re-export createClient so callers can also do:
//   import { createClient } from '@/lib/supabase'
export { createClient }
