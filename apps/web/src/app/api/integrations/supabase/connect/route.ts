// apps/web/src/app/api/integrations/supabase/connect/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ─── Request Schema ────────────────────────────────────────────────────────────

const ConnectRequestSchema = z.object({
  workspace_id: z.string().uuid({ message: 'workspace_id must be a valid UUID' }),
  project_url: z
    .string()
    .url({ message: 'project_url must be a valid URL' })
    .refine(
      (url) => url.startsWith('https://') && url.includes('.supabase.co'),
      { message: 'project_url must be a valid Supabase project URL (https://<ref>.supabase.co)' }
    ),
  service_role_key: z
    .string()
    .min(1, { message: 'service_role_key is required' }),
  anon_key: z.string().optional(),
});

type ConnectRequest = z.infer<typeof ConnectRequestSchema>;

// ─── Response Types ────────────────────────────────────────────────────────────

interface ConnectSuccessResponse {
  connection_id: string;
  project_url: string;
  status: 'connected';
}

interface ErrorResponse {
  error: string;
  details?: string | Record<string, unknown>;
  code?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const VALIDATION_TIMEOUT_MS = 10_000; // 10 seconds
const VALID_HTTP_STATUSES = new Set([200, 404]); // 404 means project exists but endpoint not found — still valid auth

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a project URL by stripping trailing slashes.
 */
function normaliseProjectUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Validate Supabase credentials by calling {project_url}/rest/v1/
 * with the service role key as the apikey header.
 *
 * Accepts HTTP 200 or 404 as "valid" — any 401/403 means bad credentials.
 * Returns the HTTP status code or throws on network error.
 */
async function validateSupabaseCredentials(
  projectUrl: string,
  serviceRoleKey: string
): Promise<{ valid: boolean; status: number; error?: string }> {
  const endpoint = `${projectUrl}/rest/v1/`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (VALID_HTTP_STATUSES.has(response.status)) {
      return { valid: true, status: response.status };
    }

    // 401 / 403 → invalid key
    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        status: response.status,
        error: `Authentication failed (HTTP ${response.status}). The service_role_key appears to be invalid.`,
      };
    }

    // Unexpected status — treat conservatively as invalid
    return {
      valid: false,
      status: response.status,
      error: `Unexpected HTTP ${response.status} from Supabase project. Unable to verify credentials.`,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === 'AbortError') {
      return {
        valid: false,
        status: 0,
        error: `Connection timed out after ${VALIDATION_TIMEOUT_MS / 1000}s. Check that project_url is reachable.`,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      status: 0,
      error: `Network error while validating credentials: ${message}`,
    };
  }
}

/**
 * Get the authenticated user from the request using the platform Supabase client.
 * Reads the Authorization Bearer token from the incoming request.
 */
async function getAuthenticatedUser(
  request: NextRequest,
  supabase: ReturnType<typeof createClient>
): Promise<{ userId: string } | { error: string }> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '').trim();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: error?.message ?? 'Unable to authenticate request' };
  }

  return { userId: user.id };
}

/**
 * Upsert a record in provider_connections.
 * Uses workspace_id + provider as the unique conflict target.
 */
async function upsertProviderConnection(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    userId: string;
    projectUrl: string;
    serviceRoleKey: string;
    anonKey?: string;
  }
): Promise<{ connectionId: string } | { error: string; details?: unknown }> {
  const { workspaceId, userId, projectUrl, serviceRoleKey, anonKey } = params;

  const now = new Date().toISOString();

  const record = {
    workspace_id: workspaceId,
    user_id: userId,
    provider: 'supabase' as const,
    access_token_ref: serviceRoleKey,
    status: 'active' as const,
    metadata: {
      project_url: projectUrl,
      ...(anonKey ? { anon_key: anonKey } : {}),
    },
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('provider_connections')
    .upsert(record, {
      onConflict: 'workspace_id,provider',
      ignoreDuplicates: false,
    })
    .select('id')
    .single();

  if (error) {
    return {
      error: 'Failed to save connection to database',
      details: error.message,
    };
  }

  if (!data?.id) {
    return { error: 'Database upsert succeeded but returned no connection ID' };
  }

  return { connectionId: data.id as string };
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse<ConnectSuccessResponse | ErrorResponse>> {
  // ── 1. Parse request body ──────────────────────────────────────────────────

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      { error: 'Invalid JSON body', code: 'PARSE_ERROR' },
      { status: 400 }
    );
  }

  // ── 2. Validate input schema ───────────────────────────────────────────────

  const parseResult = ConnectRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json<ErrorResponse>(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const {
    workspace_id,
    project_url: rawProjectUrl,
    service_role_key,
    anon_key,
  }: ConnectRequest = parseResult.data;

  const project_url = normaliseProjectUrl(rawProjectUrl);

  // ── 3. Initialise platform Supabase client ─────────────────────────────────

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[supabase/connect] Missing platform Supabase env vars');
    return NextResponse.json<ErrorResponse>(
      { error: 'Server configuration error', code: 'SERVER_CONFIG_ERROR' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 4. Authenticate the calling user ──────────────────────────────────────

  const authResult = await getAuthenticatedUser(request, supabase);
  if ('error' in authResult) {
    return NextResponse.json<ErrorResponse>(
      { error: authResult.error, code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const { userId } = authResult;

  // ── 5. Verify the user belongs to (or owns) the workspace ─────────────────

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    console.error('[supabase/connect] Membership check error:', membershipError);
    return NextResponse.json<ErrorResponse>(
      { error: 'Failed to verify workspace membership', code: 'DB_ERROR' },
      { status: 500 }
    );
  }

  if (!membership) {
    return NextResponse.json<ErrorResponse>(
      {
        error: 'You do not have access to this workspace',
        code: 'FORBIDDEN',
      },
      { status: 403 }
    );
  }

  // ── 6. Validate Supabase credentials ──────────────────────────────────────

  console.info(`[supabase/connect] Validating credentials for project: ${project_url}`);

  const validation = await validateSupabaseCredentials(project_url, service_role_key);

  if (!validation.valid) {
    return NextResponse.json<ErrorResponse>(
      {
        error: 'Supabase credential validation failed',
        code: 'INVALID_CREDENTIALS',
        details: validation.error,
      },
      { status: 422 }
    );
  }

  console.info(
    `[supabase/connect] Validation passed (HTTP ${validation.status}) for ${project_url}`
  );

  // ── 7. Upsert provider_connections ────────────────────────────────────────

  const upsertResult = await upsertProviderConnection(supabase, {
    workspaceId: workspace_id,
    userId,
    projectUrl: project_url,
    serviceRoleKey: service_role_key,
    anonKey: anon_key,
  });

  if ('error' in upsertResult) {
    console.error('[supabase/connect] Upsert error:', upsertResult);
    return NextResponse.json<ErrorResponse>(
      {
        error: upsertResult.error,
        code: 'DB_UPSERT_ERROR',
        details: upsertResult.details as string,
      },
      { status: 500 }
    );
  }

  // ── 8. Return success ──────────────────────────────────────────────────────

  console.info(
    `[supabase/connect] Connection established. connection_id=${upsertResult.connectionId}`
  );

  return NextResponse.json<ConnectSuccessResponse>(
    {
      connection_id: upsertResult.connectionId,
      project_url,
      status: 'connected',
    },
    { status: 200 }
  );
}

// Only POST is supported on this route
export async function GET(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json<ErrorResponse>(
    { error: 'Method not allowed. Use POST.', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}