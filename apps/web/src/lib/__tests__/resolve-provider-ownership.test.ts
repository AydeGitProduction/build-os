// apps/web/src/lib/__tests__/resolve-provider-ownership.test.ts

import { resolveProviderOwnership } from '../resolve-provider-ownership';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@supabase/supabase-js';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('resolveProviderOwnership', () => {
  const adminId = 'admin-123';
  const projectId = 'project-456';
  const provider = 'github';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('returns platform_managed when Supabase config is missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await resolveProviderOwnership(adminId, projectId, provider);

    expect(result.mode).toBe('platform_managed');
    expect(result.resolvedBy).toBe('platform_fallback');
    expect(result.connection).toBeNull();
  });

  it('returns user_managed from project-level connection (project_override)', async () => {
    const mockConnection = {
      id: 'conn-1',
      provider: 'github',
      mode: 'user_managed',
      access_token_ref: 'ghp_projecttoken123',
      active: true,
    };

    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: mockConnection, error: null });
    const mockEq = jest.fn().mockReturnThis();
    const mockSelect = jest.fn().mockReturnThis();
    const mockFrom = jest.fn().mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      maybeSingle: mockMaybeSingle,
    });

    // Chain all .eq calls
    let callCount = 0;
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockConnection, error: null }),
      is: jest.fn().mockReturnThis(),
    };

    mockCreateClient.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as ReturnType<typeof createClient>);

    const result = await resolveProviderOwnership(adminId, projectId, provider);

    expect(result.mode).toBe('user_managed');
    expect(result.resolvedBy).toBe('project_override');
    expect(result.connection?.access_token_ref).toBe('ghp_projecttoken123');
  });

  it('falls through to admin_default when no project connection', async () => {
    const adminConnection = {
      id: 'conn-2',
      provider: 'github',
      mode: 'user_managed',
      access_token_ref: 'ghp_admintoken456',
      active: true,
    };

    let queryCount = 0;
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(() => {
        queryCount++;
        // First query (project) returns null, second (admin) returns connection
        if (queryCount === 1) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: adminConnection, error: null });
      }),
    };

    mockCreateClient.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as ReturnType<typeof createClient>);

    const result = await resolveProviderOwnership(adminId, projectId, provider);

    expect(result.mode).toBe('user_managed');
    expect(result.resolvedBy).toBe('admin_default');
    expect(result.connection?.access_token_ref).toBe('ghp_admintoken456');
  });

  it('returns platform_fallback when no connections found', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockCreateClient.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as ReturnType<typeof createClient>);

    const result = await resolveProviderOwnership(adminId, projectId, provider);

    expect(result.mode).toBe('platform_managed');
    expect(result.resolvedBy).toBe('platform_fallback');
    expect(result.connection).toBeNull();
  });

  it('returns platform_managed for platform_managed project connection', async () => {
    const platformConnection = {
      id: 'conn-3',
      provider: 'github',
      mode: 'platform_managed',
      access_token_ref: null,
      active: true,
    };

    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: platformConnection, error: null }),
    };

    mockCreateClient.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as ReturnType<typeof createClient>);

    const result = await resolveProviderOwnership(adminId, projectId, provider);

    expect(result.mode).toBe('platform_managed');
    expect(result.resolvedBy).toBe('project_override');
  });
});