// src/lib/ownership/resolve-vercel-ownership.ts
import { AdminClient } from '@/lib/supabase/admin-client';
import { resolveProviderOwnership, OwnershipResolutionError } from './resolve-provider-ownership';
import { ResolvedVercelOwnership } from './types';

/**
 * Vercel-specific ownership resolution.
 *
 * Extracts `teamId` and `slug` from connection metadata when user_managed,
 * and falls back to VERCEL_TEAM_ID env var when platform_managed.
 */
export async function resolveVercelOwnership(
  admin: AdminClient,
  projectId: string,
): Promise<ResolvedVercelOwnership> {
  const resolved = await resolveProviderOwnership(admin, projectId, 'vercel');

  // Extract team info — present in both modes but from different sources
  const teamId =
    (resolved.metadata?.team_id as string | undefined) ??
    (resolved.mode === 'platform_managed' ? process.env.VERCEL_TEAM_ID : undefined);

  const slug =
    (resolved.metadata?.team_slug as string | undefined) ??
    (resolved.mode === 'platform_managed' ? process.env.VERCEL_TEAM_SLUG : undefined);

  return {
    ...resolved,
    teamId,
    slug,
  };
}