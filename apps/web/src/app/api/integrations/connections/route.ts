// apps/web/src/app/api/integrations/connections/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Supabase admin client (service-role key — bypasses RLS for ownership checks)
// ---------------------------------------------------------------------------
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Supabase user client (reads session from request cookies)
// ---------------------------------------------------------------------------
async function getUserClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll called from a Server Component — safe to ignore in read-only contexts
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The safe projection returned to callers.
 * access_token_ref is deliberately excluded.
 */
interface ConnectionMetadata {
  id: string;
  workspace_id: string;
  provider: string;
  status: string;
  username: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
  /** Any additional provider-specific metadata stored as JSON */
  metadata: Record<string, unknown> | null;
}

interface ListConnectionsResponse {
  connections: ConnectionMetadata[];
  total: number;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(
  message: string,
  status: number,
  code?: string
): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

/**
 * Verify the authenticated user is an active member of the given workspace.
 * Uses the admin client to avoid RLS interference, but validates membership
 * through the workspace_members table.
 */
async function assertWorkspaceMembership(
  adminClient: ReturnType<typeof getAdminClient>,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data, error } = await adminClient
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[connections] membership check error:", error);
    return false;
  }

  return data !== null;
}

// ---------------------------------------------------------------------------
// GET /api/integrations/connections?workspace_id={id}
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ListConnectionsResponse | ErrorResponse>> {
  // ── 1. Parse query parameters ────────────────────────────────────────────
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspace_id");

  if (!workspaceId || workspaceId.trim() === "") {
    return errorResponse(
      "Missing required query parameter: workspace_id",
      400,
      "MISSING_WORKSPACE_ID"
    );
  }

  // Basic UUID format check to prevent injection and provide early feedback
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(workspaceId)) {
    return errorResponse(
      "Invalid workspace_id format — expected a UUID",
      400,
      "INVALID_WORKSPACE_ID"
    );
  }

  // ── 2. Authenticate the requesting user ───────────────────────────────────
  let userId: string;
  try {
    const userClient = await getUserClient();
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return errorResponse("Unauthorized — no valid session", 401, "UNAUTHORIZED");
    }

    userId = user.id;
  } catch (err) {
    console.error("[connections] auth error:", err);
    return errorResponse("Authentication service unavailable", 503, "AUTH_ERROR");
  }

  // ── 3. Initialise admin client ─────────────────────────────────────────────
  let adminClient: ReturnType<typeof getAdminClient>;
  try {
    adminClient = getAdminClient();
  } catch (err) {
    console.error("[connections] admin client init error:", err);
    return errorResponse("Server configuration error", 500, "CONFIG_ERROR");
  }

  // ── 4. Verify workspace membership ────────────────────────────────────────
  const isMember = await assertWorkspaceMembership(adminClient, userId, workspaceId);
  if (!isMember) {
    // Return 403 — do not reveal whether the workspace exists at all
    return errorResponse(
      "Forbidden — you are not a member of this workspace",
      403,
      "FORBIDDEN"
    );
  }

  // ── 5. Fetch provider_connections — NEVER expose access_token_ref ─────────
  const { data: connections, error: queryError } = await adminClient
    .from("provider_connections")
    .select(
      [
        "id",
        "workspace_id",
        "provider",
        "status",
        "username",
        "last_verified_at",
        "created_at",
        "updated_at",
        "metadata",
        // access_token_ref is intentionally NOT selected
      ].join(", ")
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (queryError) {
    console.error("[connections] query error:", queryError);
    return errorResponse(
      "Failed to retrieve connections",
      500,
      "QUERY_ERROR"
    );
  }

  // ── 6. Shape and return the response ──────────────────────────────────────
  const safeConnections: ConnectionMetadata[] = (connections ?? []).map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    provider: row.provider,
    status: row.status,
    username: row.username ?? null,
    last_verified_at: row.last_verified_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: row.metadata ?? null,
    // access_token_ref is deliberately absent from this mapping
  }));

  return NextResponse.json(
    {
      connections: safeConnections,
      total: safeConnections.length,
    },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// Reject non-GET methods explicitly
// ---------------------------------------------------------------------------

export async function POST(): Promise<NextResponse<ErrorResponse>> {
  return errorResponse("Method Not Allowed", 405, "METHOD_NOT_ALLOWED");
}

export async function PUT(): Promise<NextResponse<ErrorResponse>> {
  return errorResponse("Method Not Allowed", 405, "METHOD_NOT_ALLOWED");
}

export async function PATCH(): Promise<NextResponse<ErrorResponse>> {
  return errorResponse("Method Not Allowed", 405, "METHOD_NOT_ALLOWED");
}

export async function DELETE(): Promise<NextResponse<ErrorResponse>> {
  return errorResponse("Method Not Allowed", 405, "METHOD_NOT_ALLOWED");
}