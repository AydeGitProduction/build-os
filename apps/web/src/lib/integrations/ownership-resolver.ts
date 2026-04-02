// apps/web/src/lib/integrations/ownership-resolver.ts

export type IntegrationMode = 'user_managed' | 'platform_managed';

export interface OwnershipResolverInput {
  provider: string;
  projectId: string;
  userId: string;
  teamId?: string;
  storedMode: string | null;
}

export interface OwnershipResolverResult {
  mode: IntegrationMode;
  reason: string;
}

/**
 * Determines whether an integration is user-managed or platform-managed.
 *
 * Resolution order:
 * 1. If a stored mode exists in the DB, trust it (explicit configuration wins).
 * 2. If the project belongs to a team, default to platform_managed.
 * 3. Otherwise default to user_managed.
 *
 * This resolver is intentionally synchronous-first — async overrides can be
 * layered on top (e.g. checking an org-level config table) without breaking
 * the contract.
 */
export async function resolveIntegrationOwnership(
  input: OwnershipResolverInput,
): Promise<OwnershipResolverResult> {
  const { storedMode, teamId } = input;

  // Explicit stored configuration takes highest priority
  if (storedMode === 'user_managed' || storedMode === 'platform_managed') {
    return { mode: storedMode, reason: 'stored_configuration' };
  }

  // Team projects default to platform-managed (centrally controlled)
  if (teamId) {
    return { mode: 'platform_managed', reason: 'team_project_default' };
  }

  // Personal projects default to user-managed
  return { mode: 'user_managed', reason: 'personal_project_default' };
}