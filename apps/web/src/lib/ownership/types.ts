// src/lib/ownership/types.ts
export type OwnershipMode = 'user_managed' | 'platform_managed';

export interface ProviderConnection {
  id: string;
  provider: string;
  mode: OwnershipMode;
  metadata: Record<string, unknown>;
  encryptedToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedOwnership {
  mode: OwnershipMode;
  token: string;
  metadata: Record<string, unknown>;
  connectionId?: string;
}

export interface ResolvedVercelOwnership extends ResolvedOwnership {
  teamId?: string;
  slug?: string;
}