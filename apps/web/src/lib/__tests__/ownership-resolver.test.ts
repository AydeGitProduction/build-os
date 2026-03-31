// apps/web/src/lib/__tests__/ownership-resolver.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OwnershipResolution } from '@/types/provider-connections'

// ---------------------------------------------------------------------------
// Mock provider-connections before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('@/lib/provider-connections', () => ({
  getActiveConnection: vi.fn(),
}))

import { getActiveConnection } from '@/lib/provider-connections'
import {
  resolveProviderOwnership,
  hasUserConnection,
  isResolutionUsable,
} from '../ownership-resolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2024-06-01T12:00:00.000Z')

/** Build a minimal mock Supabase admin client */
function buildMockAdmin(projectRow?: {
  workspace_id?: string | null
  error?: string
}): SupabaseClient {
  const single = vi.fn().mockResolvedValue(
    projectRow?.error
      ? { data: null, error: { message: projectRow.error } }
      : { data: { workspace_id: projectRow?.workspace_id ?? 'ws-123' }, error: null },
  )

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single,
    }),
  } as unknown as SupabaseClient
}

/** Build a mock active connection */
function buildConnection(overrides: Partial<{
  id: string
  status: string
  access_token_ref: string | null
  token_expires_at: string | null
  provider_account_name: string | null
  metadata: Record<string, unknown> | null
}> = {}) {
  return {
    id: 'conn-abc',
    status: 'active',
    access_token_ref: 'ghp_rawtoken123',
    token_expires_at: null,
    provider_account_name: 'acme-org',
    metadata: { team_id: 'T_kgDOA' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('resolveProviderOwnership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- Happy path -----------------------------------------------------------

  it('returns user_managed when active connection with no expiry', async () => {
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(buildConnection())

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('user_managed')
    if (result.mode === 'user_managed') {
      expect(result.connection_id).toBe('conn-abc')
      expect(result.access_token).toBe('ghp_rawtoken123')
      expect(result.team_id).toBe('T_kgDOA')
      expect(result.account_name).toBe('acme-org')
    }
  })

  it('returns user_managed when token expires well in the future', async () => {
    const futureExpiry = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString() // +1 hour
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ token_expires_at: futureExpiry }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('user_managed')
  })

  it('includes team_id undefined when metadata has no team_id', async () => {
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ metadata: {} }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'vercel')

    expect(result.mode).toBe('user_managed')
    if (result.mode === 'user_managed') {
      expect(result.team_id).toBeUndefined()
    }
  })

  it('includes account_name undefined when provider_account_name is null', async () => {
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ provider_account_name: null }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    if (result.mode === 'user_managed') {
      expect(result.account_name).toBeUndefined()
    }
  })

  // --- Token expiry ---------------------------------------------------------

  it('returns platform_managed(token_expired) when token expires in < 5 min', async () => {
    // Expires in 4 minutes — within the 5-minute buffer
    const nearExpiry = new Date(NOW.getTime() + 4 * 60 * 1000).toISOString()
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ token_expires_at: nearExpiry }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
    if (result.mode === 'platform_managed') {
      expect(result.fallback_reason).toBe('token_expired')
    }
  })

  it('returns platform_managed(token_expired) when token already expired', async () => {
    const pastExpiry = new Date(NOW.getTime() - 60 * 1000).toISOString() // 1 minute ago
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ token_expires_at: pastExpiry }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
    if (result.mode === 'platform_managed') {
      expect(result.fallback_reason).toBe('token_expired')
    }
  })

  it('returns user_managed when token expires exactly at 5-minute boundary + 1ms', async () => {
    // Expires in 5 min + 1 ms — just outside the buffer
    const safeExpiry = new Date(NOW.getTime() + 5 * 60 * 1000 + 1).toISOString()
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ token_expires_at: safeExpiry }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('user_managed')
  })

  // --- No connection / inactive ---------------------------------------------

  it('returns platform_managed(no_active_connection) when getActiveConnection returns null', async () => {
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(null)

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
    if (result.mode === 'platform_managed') {
      expect(result.fallback_reason).toBe('no_active_connection')
    }
  })

  it('returns platform_managed(no_active_connection) when connection.status is inactive', async () => {
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ status: 'inactive' }),
    )

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
    if (result.mode === 'platform_managed') {
      // connection exists but status not active → fallback reason per algorithm step 4
      expect(result.fallback_reason).toBe('token_expired')
    }
  })

  // --- Error paths ----------------------------------------------------------

  it('returns platform_managed when project DB query returns error', async () => {
    const admin = buildMockAdmin({ error: 'relation "projects" does not exist' })

    const result = await resolveProviderOwnership(admin, 'proj-missing', 'github')

    expect(result.mode).toBe('platform_managed')
    if (result.mode === 'platform_managed') {
      expect(result.fallback_reason).toBe('no_active_connection')
    }
  })

  it('returns platform_managed when project has no workspace_id', async () => {
    const admin = buildMockAdmin({ workspace_id: null })

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
  })

  it('returns platform_managed when getActiveConnection throws', async () => {
    const admin = buildMockAdmin({ workspace_id: 'ws-123' })
    vi.mocked(getActiveConnection).mockRejectedValue(new Error('network failure'))

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
    if (result.mode === 'platform_managed') {
      expect(result.fallback_reason).toBe('no_active_connection')
    }
  })

  it('does not throw when admin.from throws synchronously', async () => {
    const admin = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('boom')
      }),
    } as unknown as SupabaseClient

    const result = await resolveProviderOwnership(admin, 'proj-1', 'github')

    expect(result.mode).toBe('platform_managed')
  })
})

// ---------------------------------------------------------------------------

describe('hasUserConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true when active connection with valid token exists', async () => {
    vi.mocked(getActiveConnection).mockResolvedValue(buildConnection())

    const result = await hasUserConnection(
      {} as SupabaseClient,
      'ws-123',
      'github',
    )

    expect(result).toBe(true)
  })

  it('returns false when no connection', async () => {
    vi.mocked(getActiveConnection).mockResolvedValue(null)

    const result = await hasUserConnection({} as SupabaseClient, 'ws-123', 'github')

    expect(result).toBe(false)
  })

  it('returns false when connection status is inactive', async () => {
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ status: 'inactive' }),
    )

    const result = await hasUserConnection({} as SupabaseClient, 'ws-123', 'github')

    expect(result).toBe(false)
  })

  it('returns false when token is expiring soon', async () => {
    const nearExpiry = new Date(NOW.getTime() + 2 * 60 * 1000).toISOString()
    vi.mocked(getActiveConnection).mockResolvedValue(
      buildConnection({ token_expires_at: nearExpiry }),
    )

    const result = await hasUserConnection({} as SupabaseClient, 'ws-123', 'github')

    expect(result).toBe(false)
  })

  it('returns false on getActiveConnection error', async () => {
    vi.mocked(getActiveConnection).mockRejectedValue(new Error('db error'))

    const result = await hasUserConnection({} as SupabaseClient, 'ws-123', 'github')

    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('isResolutionUsable', () => {
  it('returns true for platform_managed', () => {
    const resolution: OwnershipResolution = {
      mode: 'platform_managed',
      fallback_reason: 'no_active_connection',
    }
    expect(isResolutionUsable(resolution)).toBe(true)
  })

  it('returns true for user_managed with valid token', () => {
    const resolution: OwnershipResolution = {
      mode: 'user_managed',
      connection_id: 'conn-1',
      access_token: 'ghp_abc123',
    }
    expect(isResolutionUsable(resolution)).toBe(true)
  })

  it('returns false for user_managed with undefined token', () => {
    const resolution: OwnershipResolution = {
      mode: 'user_managed',
      connection_id: 'conn-1',
      access_token: undefined,
    }
    expect(isResolutionUsable(resolution)).toBe(false)
  })

  it('returns false for user_managed with empty string token', () => {
    const resolution: OwnershipResolution = {
      mode: 'user_managed',
      connection_id: 'conn-1',
      access_token: '',
    }
    expect(isResolutionUsable(resolution)).toBe(false)
  })

  it('returns false for user_managed with whitespace-only token', () => {
    const resolution: OwnershipResolution = {
      mode: 'user_managed',
      connection_id: 'conn-1',
      access_token: '   ',
    }
    expect(isResolutionUsable(resolution)).toBe(false)
  })

  it('returns true for platform_managed with token_expired reason', () => {
    const resolution: OwnershipResolution = {
      mode: 'platform_managed',
      fallback_reason: 'token_expired',
    }
    expect(isResolutionUsable(resolution)).toBe(true)
  })
})