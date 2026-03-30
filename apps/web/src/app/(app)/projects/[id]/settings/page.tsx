// src/app/(app)/projects/[id]/settings/page.tsx
// Project settings page — shows infrastructure provisioning status

import { Suspense } from 'react';

interface Props {
  params: { id: string };
}

export default function ProjectSettingsPage({ params }: Props) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Project Settings</h1>
      <Suspense fallback={<div className="text-gray-500">Loading infrastructure status…</div>}>
        <InfrastructureStatus projectId={params.id} />
      </Suspense>
    </div>
  );
}

async function InfrastructureStatus({ projectId }: { projectId: string }) {
  // Server-side fetch of provisioning status
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let githubRepo: string | null = null;
  let vercelUrl: string | null = null;
  let provisioned = false;

  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/project_integrations?project_id=eq.${projectId}&select=provider_id,environment_map,status`,
        {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const integrations = (await res.json()) as Array<{
          provider_id: string;
          environment_map: Record<string, string>;
          status: string;
        }>;
        const GITHUB_PROVIDER = '05e2c85b-69f5-4eb4-b2d0-cf243b2f2838';
        const VERCEL_PROVIDER = '3acd1958-53d9-48fb-81a6-9ee70ea3ad69';
        const github = integrations.find(i => i.provider_id === GITHUB_PROVIDER && i.status === 'active');
        const vercel = integrations.find(i => i.provider_id === VERCEL_PROVIDER && i.status === 'active');
        if (github) githubRepo = github.environment_map?.github_repo_url ?? null;
        if (vercel) vercelUrl = vercel.environment_map?.production_url ?? null;
        provisioned = !!(github || vercel);
      }
    } catch {
      // Silently fall through — show "not provisioned" state
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Infrastructure</h2>
      {!provisioned ? (
        <p className="text-sm text-gray-500">
          GitHub repository and Vercel project are being provisioned. This may take a moment.
        </p>
      ) : (
        <div className="space-y-3">
          {githubRepo && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 w-32 shrink-0">GitHub Repo</span>
              <a
                href={githubRepo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate"
              >
                {githubRepo}
              </a>
            </div>
          )}
          {vercelUrl && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 w-32 shrink-0">Vercel URL</span>
              <a
                href={vercelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate"
              >
                {vercelUrl}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
