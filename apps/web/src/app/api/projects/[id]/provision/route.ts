import { NextRequest } from "next/server";
import { POST } from "./route";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/github-provision", () => ({
  provisionGitHubRepo: jest.fn(),
}));

jest.mock("@/lib/vercel-provision", () => ({
  provisionVercelProject: jest.fn(),
  injectVercelEnvVars: jest.fn(),
}));

jest.mock("@/lib/provision-db", () => ({
  saveProvisioningResult: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { provisionGitHubRepo } from "@/lib/github-provision";
import { provisionVercelProject, injectVercelEnvVars } from "@/lib/vercel-provision";
import { saveProvisioningResult } from "@/lib/provision-db";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const MOCK_PROJECT = {
  id: "proj-123",
  slug: "my-project",
  name: "My Project",
  status: "active",
};

const MOCK_GITHUB_RESULT = {
  repoName: "my-project",
  repoUrl: "https://github.com/org/my-project",
  repoFullName: "org/my-project",
  defaultBranch: "main",
};

const MOCK_VERCEL_RESULT = {
  vercelProjectId: "vercel-proj-abc",
  productionUrl: "https://my-project.vercel.app",
};

const INTERNAL_SECRET = "test-internal-secret";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(
  projectId: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/${projectId}/provision`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    }
  );
}

function mockSupabaseForProject(project: typeof MOCK_PROJECT | null, alreadyProvisioned = false) {
  const mockSingle = jest.fn().mockResolvedValue({
    data: project,
    error: project ? null : { message: "Not found" },
  });

  const mockMaybeSingle = jest.fn().mockResolvedValue({
    data: alreadyProvisioned ? { id: "integration-1", status: "active" } : null,
    error: null,
  });

  const mockSelect = jest.fn().mockReturnThis();
  const mockEq = jest.fn().mockReturnThis();

  (createClient as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    }),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/projects/[id]/provision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BUILDOS_INTERNAL_SECRET = INTERNAL_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  // ── Auth Tests ─────────────────────────────────────────────────────────────

  describe("Authentication", () => {
    it("returns 401 when no credentials provided", async () => {
      const req = makeRequest("proj-123");
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.step).toBe("auth");
    });

    it("returns 401 when internal secret is wrong", async () => {
      const req = makeRequest("proj-123", { "x-buildos-secret": "wrong-secret" });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid internal secret");
    });

    it("accepts valid BUILDOS_INTERNAL_SECRET", async () => {
      mockSupabaseForProject(MOCK_PROJECT);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockResolvedValue(undefined);
      (saveProvisioningResult as jest.Mock).mockResolvedValue(undefined);

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(200);
    });

    it("accepts valid BUILDOS_SECRET (legacy)", async () => {
      delete process.env.BUILDOS_INTERNAL_SECRET;
      process.env.BUILDOS_SECRET = "legacy-secret";

      mockSupabaseForProject(MOCK_PROJECT);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockResolvedValue(undefined);
      (saveProvisioningResult as jest.Mock).mockResolvedValue(undefined);

      const req = makeRequest("proj-123", { "x-buildos-secret": "legacy-secret" });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(200);
      delete process.env.BUILDOS_SECRET;
    });
  });

  // ── Project Lookup Tests ───────────────────────────────────────────────────

  describe("Project lookup", () => {
    it("returns 404 when project not found", async () => {
      mockSupabaseForProject(null);

      const req = makeRequest("proj-unknown", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-unknown" } });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Project not found");
    });
  });

  // ── Idempotency Tests ──────────────────────────────────────────────────────

  describe("Idempotency", () => {
    it("returns alreadyProvisioned=true when active integration exists", async () => {
      mockSupabaseForProject(MOCK_PROJECT, true);

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyProvisioned).toBe(true);

      // Should not call any provisioning steps
      expect(provisionGitHubRepo).not.toHaveBeenCalled();
      expect(provisionVercelProject).not.toHaveBeenCalled();
    });
  });

  // ── Provisioning Flow Tests ────────────────────────────────────────────────

  describe("Provisioning flow", () => {
    it("returns success with repoUrl and vercelUrl on full success", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockResolvedValue(undefined);
      (saveProvisioningResult as jest.Mock).mockResolvedValue(undefined);

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        repoUrl: MOCK_GITHUB_RESULT.repoUrl,
        vercelUrl: MOCK_VERCEL_RESULT.productionUrl,
      });
    });

    it("calls steps in correct sequential order", async () => {
      const order: string[] = [];

      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockImplementation(async () => {
        order.push("github");
        return MOCK_GITHUB_RESULT;
      });
      (provisionVercelProject as jest.Mock).mockImplementation(async () => {
        order.push("vercel");
        return MOCK_VERCEL_RESULT;
      });
      (injectVercelEnvVars as jest.Mock).mockImplementation(async () => {
        order.push("env");
      });
      (saveProvisioningResult as jest.Mock).mockImplementation(async () => {
        order.push("db");
      });

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      await POST(req, { params: { id: "proj-123" } });

      expect(order).toEqual(["github", "vercel", "env", "db"]);
    });

    it("passes repoName from GitHub result to Vercel provisioning", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockResolvedValue(undefined);
      (saveProvisioningResult as jest.Mock).mockResolvedValue(undefined);

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      await POST(req, { params: { id: "proj-123" } });

      expect(provisionVercelProject).toHaveBeenCalledWith(
        MOCK_PROJECT,
        MOCK_GITHUB_RESULT.repoName
      );
    });

    it("passes vercelProjectId from Vercel result to env injection", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockResolvedValue(undefined);
      (saveProvisioningResult as jest.Mock).mockResolvedValue(undefined);

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      await POST(req, { params: { id: "proj-123" } });

      expect(injectVercelEnvVars).toHaveBeenCalledWith(
        MOCK_VERCEL_RESULT.vercelProjectId,
        MOCK_PROJECT
      );
    });
  });

  // ── Error Handling Tests ───────────────────────────────────────────────────

  describe("Step-level error handling", () => {
    it("returns step=github on GitHub failure", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockRejectedValue(
        new Error("GitHub API rate limit exceeded")
      );

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({
        error: "GitHub API rate limit exceeded",
        step: "github",
      });

      // Subsequent steps should NOT be called
      expect(provisionVercelProject).not.toHaveBeenCalled();
      expect(injectVercelEnvVars).not.toHaveBeenCalled();
      expect(saveProvisioningResult).not.toHaveBeenCalled();
    });

    it("returns step=vercel on Vercel failure", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockRejectedValue(
        new Error("Vercel team not found")
      );

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({
        error: "Vercel team not found",
        step: "vercel",
      });

      expect(injectVercelEnvVars).not.toHaveBeenCalled();
      expect(saveProvisioningResult).not.toHaveBeenCalled();
    });

    it("returns step=env on env injection failure", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockRejectedValue(
        new Error("Env var already exists")
      );

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({
        error: "Env var already exists",
        step: "env",
      });

      expect(saveProvisioningResult).not.toHaveBeenCalled();
    });

    it("returns step=db on database save failure", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockResolvedValue(MOCK_GITHUB_RESULT);
      (provisionVercelProject as jest.Mock).mockResolvedValue(MOCK_VERCEL_RESULT);
      (injectVercelEnvVars as jest.Mock).mockResolvedValue(undefined);
      (saveProvisioningResult as jest.Mock).mockRejectedValue(
        new Error("Unique constraint violation")
      );

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({
        error: "Unique constraint violation",
        step: "db",
      });
    });

    it("handles non-Error thrown objects gracefully", async () => {
      mockSupabaseForProject(MOCK_PROJECT, false);
      (provisionGitHubRepo as jest.Mock).mockRejectedValue("string error");

      const req = makeRequest("proj-123", { "x-buildos-secret": INTERNAL_SECRET });
      const res = await POST(req, { params: { id: "proj-123" } });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.step).toBe("github");
      expect(typeof body.error).toBe("string");
    });
  });
});
