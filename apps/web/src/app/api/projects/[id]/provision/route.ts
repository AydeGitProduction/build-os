// src/app/api/projects/[id]/provision/route.ts
//
// POST /api/projects/:id/provision
//
// Provisions a per-project GitHub repository and Vercel project.
// Stores results in project_integrations and deployment_targets.
//
// Authentication:
//   Internal call: header X-BuildOS-Secret (BUILDOS_INTERNAL_SECRET env var)
//   Admin call:    header Authorization: Bearer <BUILDOS_SECRET>
//
// Idempotent: if provisioning already ran (active integration exists),
// returns the existing result without re-provisioning.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { provisionGitHubRepo, GitHubAuthError } from "@/lib/github-provision";
import { provisionVercelProject, VercelAuthError } from "@/lib/vercel-provision";
import { saveProvisioningResult } from "@/lib/provision-db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Real provider UUIDs from integration_providers table
const GITHUB_PROVIDER_ID = "05e2c85b-69f5-4eb4-b2d0-cf243b2f2838";

// ---------------------------------------------------------------------------
// Admin Supabase client
// ---------------------------------------------------------------------------

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[provision/route] Missing Supabase env vars.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function isAuthorized(request: NextRequest): boolean {
  const internalSecret = process.env.BUILDOS_INTERNAL_SECRET;
  const legacySecret = process.env.BUILDOS_SECRET;

  // X-BuildOS-Secret header (preferred for internal calls)
  const headerSecret = request.headers.get("x-buildos-secret");
  if (internalSecret && headerSecret === internalSecret) return true;
  if (legacySecret && headerSecret === legacySecret) return true;

  // Authorization: Bearer header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (internalSecret && token === internalSecret) return true;
    if (legacySecret && token === legacySecret) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = params.id;
  if (!projectId) {
    return NextResponse.json({ error: "project id is required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // ── Resolve project ───────────────────────────────────────────────────────
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json(
      { error: `Project ${projectId} not found` },
      { status: 404 }
    );
  }

  // ── Idempotency: check for existing active integration ────────────────────
  const { data: existingIntegration } = await supabase
    .from("project_integrations")
    .select("id, environment_map, status")
    .eq("project_id", projectId)
    .eq("provider_id", GITHUB_PROVIDER_ID)
    .eq("status", "active")
    .maybeSingle();

  if (existingIntegration) {
    const envMap = existingIntegration.environment_map as Record<string, unknown>;
    return NextResponse.json({
      alreadyProvisioned: true,
      projectId,
      repoUrl: envMap?.github_repo_url ?? null,
      repoName: envMap?.github_repo_name ?? null,
      message: "Project already provisioned.",
    });
  }

  // ── Provision GitHub repository ───────────────────────────────────────────
  let githubResult;
  try {
    githubResult = await provisionGitHubRepo({
      id: project.id,
      slug: (project as any).slug,
      name: (project as any).name,
    });
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      console.error("[provision/route] GitHub auth error:", err.message);
      return NextResponse.json(
        { error: "GitHub authentication failed. Check GITHUB_APP_ID / GITHUB_TOKEN env vars.", detail: err.message },
        { status: 503 }
      );
    }
    console.error("[provision/route] GitHub provisioning failed:", err);
    return NextResponse.json(
      { error: "GitHub provisioning failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // ── Provision Vercel project ──────────────────────────────────────────────
  const vercelTeamId = process.env.VERCEL_TEAM_ID ?? undefined;
  const vercelProjectName = `buildos-${(project as any).slug}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  let vercelResult;
  try {
    const provisioned = await provisionVercelProject({
      projectName: vercelProjectName,
      gitRepository: {
        type: "github",
        repo: githubResult.repoFullName,
      },
      framework: "nextjs",
      teamId: vercelTeamId,
    });
    vercelResult = {
      vercelProjectId: provisioned.project.id,
      productionUrl: `https://${vercelProjectName}.vercel.app`,
      projectName: provisioned.project.name,
    };
  } catch (err) {
    if (err instanceof VercelAuthError) {
      console.error("[provision/route] Vercel auth error:", err.message);
      return NextResponse.json(
        { error: "Vercel authentication failed. Check VERCEL_TOKEN env var.", detail: err.message },
        { status: 503 }
      );
    }
    console.error("[provision/route] Vercel provisioning failed:", err);
    return NextResponse.json(
      { error: "Vercel provisioning failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // ── Persist to DB ─────────────────────────────────────────────────────────
  try {
    await saveProvisioningResult(projectId, githubResult, vercelResult);
  } catch (err) {
    console.error("[provision/route] DB persistence failed:", err);
    // Log but don't fail the response — provisioning succeeded even if DB write fails
    return NextResponse.json(
      {
        success: true,
        warning: "Provisioning succeeded but DB persistence failed.",
        projectId,
        repoUrl: githubResult.repoUrl,
        repoName: githubResult.repoName,
        vercelProjectId: vercelResult.vercelProjectId,
        productionUrl: vercelResult.productionUrl,
        dbError: err instanceof Error ? err.message : String(err),
      },
      { status: 207 }
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  console.log(
    `[provision/route] Provisioned project ${projectId}: ` +
    `${githubResult.repoUrl} + ${vercelResult.productionUrl}`
  );

  return NextResponse.json({
    success: true,
    projectId,
    repoUrl: githubResult.repoUrl,
    repoName: githubResult.repoName,
    repoFullName: githubResult.repoFullName,
    vercelProjectId: vercelResult.vercelProjectId,
    productionUrl: vercelResult.productionUrl,
  });
}
