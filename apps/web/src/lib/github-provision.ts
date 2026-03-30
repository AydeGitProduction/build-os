/**
 * Unit tests for provisionGitHubRepo()
 *
 * Strategy:
 *   - Mock global `fetch` to simulate GitHub API responses.
 *   - Mock `jose` to avoid real RSA operations in unit tests.
 *   - Test: successful creation (201), idempotent (422), and error cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock jose before importing the module under test
// ---------------------------------------------------------------------------
vi.mock("jose", () => {
  return {
    importPKCS8: vi.fn().mockResolvedValue({ type: "mock-private-key" }),
    SignJWT: vi.fn().mockImplementation(() => ({
      setProtectedHeader: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      setIssuer: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue("mock.jwt.token"),
    })),
  };
});

// ---------------------------------------------------------------------------
// Module under test (imported after mocks are set up)
// ---------------------------------------------------------------------------
import { provisionGitHubRepo } from "../github-provision";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nmock\n-----END RSA PRIVATE KEY-----",
  GITHUB_INSTALLATION_ID: "78901234",
  GITHUB_REPO_OWNER: "my-org",
};

const MOCK_PROJECT = {
  id: "proj_abc123",
  slug: "my-awesome-project",
  name: "My Awesome Project",
};

const MOCK_REPO_RESPONSE = {
  id: 987654321,
  name: "buildos-my-awesome-project",
  html_url: "https://github.com/my-org/buildos-my-awesome-project",
  clone_url: "https://github.com/my-org/buildos-my-awesome-project.git",
  default_branch: "main",
};

const MOCK_INSTALLATION_TOKEN_RESPONSE = {
  token: "ghs_mockInstallationToken",
  expires_at: "2099-01-01T00:00:00Z",
};

/** Creates a minimal Response-like mock */
function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean
): Response {
  const bodyStr = JSON.stringify(body);
  return {
    ok: ok ?? status >= 200 && status < 300,
    status,
    statusText: status === 201 ? "Created" : status === 422 ? "Unprocessable Entity" : "Error",
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(bodyStr),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Set env vars
  Object.entries(MOCK_ENV).forEach(([key, value]) => {
    process.env[key] = value;
  });
});

afterEach(() => {
  // Clear env vars
  Object.keys(MOCK_ENV).forEach((key) => {
    delete process.env[key];
  });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("provisionGitHubRepo()", () => {
  describe("successful creation (HTTP 201)", () => {
    it("returns normalised repo data when GitHub returns 201", async () => {
      const fetchMock = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(
          mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE) // POST /access_tokens
        )
        .mockResolvedValueOnce(
          mockResponse(201, MOCK_REPO_RESPONSE) // POST /orgs/{org}/repos
        );

      const result = await provisionGitHubRepo(MOCK_PROJECT);

      expect(result).toEqual({
        repoId: 987654321,
        repoName: "buildos-my-awesome-project",
        repoUrl: "https://github.com/my-org/buildos-my-awesome-project",
        cloneUrl: "https://github.com/my-org/buildos-my-awesome-project.git",
        defaultBranch: "main",
      });

      // Verify the create call
      const createCall = fetchMock.mock.calls[1];
      expect(createCall[0]).toBe(
        "https://api.github.com/orgs/my-org/repos"
      );
      expect(createCall[1]?.method).toBe("POST");

      const requestBody = JSON.parse(createCall[1]?.body as string);
      expect(requestBody).toEqual({
        name: "buildos-my-awesome-project",
        private: true,
        auto_init: true,
        description: "BuildOS project: My Awesome Project",
      });
    });

    it("uses correct Authorization header with installation token", async () => {
      const fetchMock = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(201, MOCK_REPO_RESPONSE));

      await provisionGitHubRepo(MOCK_PROJECT);

      const createCall = fetchMock.mock.calls[1];
      expect(createCall[1]?.headers).toMatchObject({
        Authorization: "Bearer ghs_mockInstallationToken",
      });
    });
  });

  describe("idempotent handling (HTTP 422)", () => {
    it("fetches and returns existing repo data when creation returns 422", async () => {
      const fetchMock = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(
          mockResponse(422, {
            message: "Repository creation failed.",
            errors: [{ resource: "Repository", code: "already_exists" }],
          })
        )
        .mockResolvedValueOnce(mockResponse(200, MOCK_REPO_RESPONSE)); // GET existing

      const result = await provisionGitHubRepo(MOCK_PROJECT);

      expect(result).toEqual({
        repoId: 987654321,
        repoName: "buildos-my-awesome-project",
        repoUrl: "https://github.com/my-org/buildos-my-awesome-project",
        cloneUrl: "https://github.com/my-org/buildos-my-awesome-project.git",
        defaultBranch: "main",
      });

      // Verify the GET fallback call
      const getCall = fetchMock.mock.calls[2];
      expect(getCall[0]).toBe(
        "https://api.github.com/repos/my-org/buildos-my-awesome-project"
      );
      expect(getCall[1]?.method).toBe("GET");
    });

    it("is idempotent: calling twice produces the same result", async () => {
      vi.spyOn(global, "fetch")
        // First call: create succeeds
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(201, MOCK_REPO_RESPONSE))
        // Second call: already exists
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(422, { errors: [{ code: "already_exists" }] }))
        .mockResolvedValueOnce(mockResponse(200, MOCK_REPO_RESPONSE));

      const first = await provisionGitHubRepo(MOCK_PROJECT);
      const second = await provisionGitHubRepo(MOCK_PROJECT);

      expect(first).toEqual(second);
    });
  });

  describe("error handling", () => {
    it("throws a descriptive error on HTTP 401", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(
          mockResponse(401, { message: "Bad credentials" })
        );

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /Failed to create GitHub repo.*401/
      );
    });

    it("throws a descriptive error on HTTP 500", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(
          mockResponse(500, { message: "Internal Server Error" })
        );

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /Failed to create GitHub repo.*500/
      );
    });

    it("throws if installation token request fails", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockResponse(403, { message: "Forbidden" })
      );

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /Failed to obtain installation token.*403/
      );
    });

    it("throws if GET existing repo fails after 422", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(422, { errors: [{ code: "already_exists" }] }))
        .mockResolvedValueOnce(mockResponse(404, { message: "Not Found" }));

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /Failed to fetch existing repo.*404/
      );
    });
  });

  describe("input validation", () => {
    it("throws if project.slug is empty", async () => {
      await expect(
        provisionGitHubRepo({ id: "id1", slug: "", name: "Test" })
      ).rejects.toThrow(/project.id, project.slug, and project.name/);
    });

    it("throws if project.name is empty", async () => {
      await expect(
        provisionGitHubRepo({ id: "id1", slug: "test-slug", name: "" })
      ).rejects.toThrow(/project.id, project.slug, and project.name/);
    });

    it("throws if GITHUB_REPO_OWNER is not set", async () => {
      delete process.env.GITHUB_REPO_OWNER;

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /GITHUB_REPO_OWNER/
      );
    });

    it("throws if GITHUB_APP_ID is not set", async () => {
      delete process.env.GITHUB_APP_ID;

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /GITHUB_APP_ID/
      );
    });

    it("throws if GITHUB_INSTALLATION_ID is not set", async () => {
      delete process.env.GITHUB_INSTALLATION_ID;

      // The installation token call will fail before reaching GitHub
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE)
      );

      await expect(provisionGitHubRepo(MOCK_PROJECT)).rejects.toThrow(
        /GITHUB_INSTALLATION_ID/
      );
    });
  });

  describe("repo naming", () => {
    it("prefixes the repo name with 'buildos-'", async () => {
      const fetchMock = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(
          mockResponse(201, {
            ...MOCK_REPO_RESPONSE,
            name: "buildos-special-slug",
          })
        );

      await provisionGitHubRepo({
        id: "proj_xyz",
        slug: "special-slug",
        name: "Special Project",
      });

      const createBody = JSON.parse(
        fetchMock.mock.calls[1][1]?.body as string
      );
      expect(createBody.name).toBe("buildos-special-slug");
    });

    it("uses the project.name in the description", async () => {
      const fetchMock = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockResponse(201, MOCK_INSTALLATION_TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(201, MOCK_REPO_RESPONSE));

      await provisionGitHubRepo(MOCK_PROJECT);

      const createBody = JSON.parse(
        fetchMock.mock.calls[1][1]?.body as string
      );
      expect(createBody.description).toBe(
        "BuildOS project: My Awesome Project"
      );
    });
  });
});
