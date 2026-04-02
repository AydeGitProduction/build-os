// apps/web/src/app/api/integrations/supabase/connect/__tests__/route.test.ts

import { POST } from '../route';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockSupabaseSingle = jest.fn();
const mockSupabaseMaybeSingle = jest.fn();
const mockSupabaseSelect = jest.fn();
const mockSupabaseEq = jest.fn();
const mockSupabaseUpsert = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: jest.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: mockSupabaseMaybeSingle,
              }),
            }),
          }),
        };
      }
      if (table === 'provider_connections') {
        return {
          upsert: mockSupabaseUpsert.mockReturnValue({
            select: mockSupabaseSelect.mockReturnValue({
              single: mockSupabaseSingle,
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeRequest(body: unknown, authToken = 'valid-jwt-token') {
  return new NextRequest('http://localhost/api/integrations/supabase/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  workspace_id: '550e8400-e29b-41d4-a716-446655440000',
  project_url: 'https://abcxyz.supabase.co',
  service_role_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role',
  anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://platform.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'platform-service-role-key';
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/integrations/supabase/connect', () => {
  describe('Input validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = new NextRequest('http://localhost/api/integrations/supabase/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        body: 'not-json{{{',
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('PARSE_ERROR');
    });

    it('returns 400 for missing workspace_id', async () => {
      const req = makeRequest({ ...VALID_BODY, workspace_id: undefined });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for non-UUID workspace_id', async () => {
      const req = makeRequest({ ...VALID_BODY, workspace_id: 'not-a-uuid' });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-Supabase project_url', async () => {
      const req = makeRequest({ ...VALID_BODY, project_url: 'https://example.com' });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing service_role_key', async () => {
      const req = makeRequest({ ...VALID_BODY, service_role_key: '' });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('accepts request without anon_key (optional)', async () => {
      const { anon_key: _, ...bodyWithoutAnon } = VALID_BODY;
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockSupabaseMaybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });
      mockFetch.mockResolvedValue({ status: 200 });
      mockSupabaseSingle.mockResolvedValue({
        data: { id: 'conn-uuid-456' },
        error: null,
      });

      const req = makeRequest(bodyWithoutAnon);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe('Authentication', () => {
    it('returns 401 when no Authorization header is present', async () => {
      const req = new NextRequest('http://localhost/api/integrations/supabase/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when Supabase returns no user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } });
      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('Workspace access', () => {
    it('returns 403 when user is not a workspace member', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });
  });

  describe('Credential validation', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockSupabaseMaybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });
    });

    it('accepts HTTP 200 from Supabase as valid', async () => {
      mockFetch.mockResolvedValue({ status: 200 });
      mockSupabaseSingle.mockResolvedValue({ data: { id: 'conn-uuid-789' }, error: null });

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts HTTP 404 from Supabase as valid (project exists, auth OK)', async () => {
      mockFetch.mockResolvedValue({ status: 404 });
      mockSupabaseSingle.mockResolvedValue({ data: { id: 'conn-uuid-789' }, error: null });

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('returns 422 when Supabase returns 401 (bad key)', async () => {
      mockFetch.mockResolvedValue({ status: 401 });

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns 422 when Supabase returns 403', async () => {
      mockFetch.mockResolvedValue({ status: 403 });

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(422);
    });

    it('returns 422 on network timeout', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            setTimeout(() => reject(err), 50);
          })
      );

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Successful connection', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null });
      mockSupabaseMaybeSingle.mockResolvedValue({ data: { role: 'owner' }, error: null });
      mockFetch.mockResolvedValue({ status: 200 });
      mockSupabaseSingle.mockResolvedValue({
        data: { id: 'conn-id-final-123' },
        error: null,
      });
    });

    it('returns 200 with connection_id, project_url, and status', async () => {
      const req = makeRequest(VALID_BODY);
      const res = await POST(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        connection_id: 'conn-id-final-123',
        project_url: 'https://abcxyz.supabase.co',
        status: 'connected',
      });
    });

    it('strips trailing slashes from project_url', async () => {
      const req = makeRequest({ ...VALID_BODY, project_url: 'https://abcxyz.supabase.co///' });
      const res = await POST(req);
      const data = await res.json();
      expect(data.project_url).toBe('https://abcxyz.supabase.co');
    });

    it('calls upsert with correct structure including anon_key in metadata', async () => {
      const req = makeRequest(VALID_BODY);
      await POST(req);

      expect(mockSupabaseUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: VALID_BODY.workspace_id,
          provider: 'supabase',
          status: 'active',
          metadata: expect.objectContaining({
            project_url: 'https://abcxyz.supabase.co',
            anon_key: VALID_BODY.anon_key,
          }),
        }),
        expect.objectContaining({ onConflict: 'workspace_id,provider' })
      );
    });

    it('calls fetch with correct URL and headers', async () => {
      const req = makeRequest(VALID_BODY);
      await POST(req);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://abcxyz.supabase.co/rest/v1/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            apikey: VALID_BODY.service_role_key,
            Authorization: `Bearer ${VALID_BODY.service_role_key}`,
          }),
        })
      );
    });
  });

  describe('Database errors', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null });
      mockSupabaseMaybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });
      mockFetch.mockResolvedValue({ status: 200 });
    });

    it('returns 500 when upsert fails', async () => {
      mockSupabaseSingle.mockResolvedValue({
        data: null,
        error: { message: 'violates foreign key constraint' },
      });

      const req = makeRequest(VALID_BODY);
      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('DB_UPSERT_ERROR');
    });
  });
});