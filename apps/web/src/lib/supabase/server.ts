// apps/web/src/lib/supabase/server.ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/**
 * Creates a Supabase client that runs under the logged-in user's session.
 * RLS policies are applied automatically.
 */
export function createServerClient() {
  return createServerComponentClient<Database>({ cookies });
}