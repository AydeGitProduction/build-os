// /apps/web/src/components/infrastructure/InfrastructureSection.tsx

'use client';

import React from 'react';
import { ExternalLink, Github, Globe, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { useProjectInfrastructure } from '@/hooks/useProjectInfrastructure';
import { DeploymentStatusBadge } from './DeploymentStatusBadge';
import { DeploymentStatus } from '@/types/integrations';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface InfrastructureSectionProps {
  projectId: string;
}

export function InfrastructureSection({ projectId }: InfrastructureSectionProps) {
  const { data, isLoading, error, isRetrying, retryProvisioning, refetch } =
    useProjectInfrastructure(projectId);

  if (isLoading) {
    return <InfrastructureSectionSkeleton />;
  }

  return (
    <section aria-labelledby="infrastructure-heading" className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            id="infrastructure-heading"
            className="text-base font-semibold text-gray-900"
          >
            Infrastructure
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Connected services and deployment targets for this project.
          </p>
        </div>
        {data?.isProvisioned && (
          <button
            onClick={refetch}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            title="Refresh infrastructure status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="sr-only">Refresh</span>
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Failed to load infrastructure data</p>
            <p className="mt-0.5 text-red-600">{error}</p>
          </div>
          <button
            onClick={refetch}
            className="shrink-0 text-red-600 underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Not Provisioned State */}
      {!error && data && !data.isProvisioned && (
        <NotProvisionedCard
          isRetrying={isRetrying}
          onRetry={retryProvisioning}
        />
      )}

      {/* Provisioned State */}
      {!error && data && data.isProvisioned && (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {/* GitHub Repository */}
          <InfrastructureRow
            icon={<Github className="h-4 w-4 text-gray-600" />}
            label="GitHub Repository"
            value={
              data.githubRepoUrl ? (
                <ExternalLink
                  href={data.githubRepoUrl}
                  label={extractRepoName(data.githubRepoUrl)}
                />
              ) : (
                <NotConfigured />
              )
            }
          />

          {/* Vercel Project */}
          <InfrastructureRow
            icon={
              <VercelIcon className="h-4 w-4 text-gray-600" />
            }
            label="Vercel Project"
            value={
              data.productionUrl ? (
                <ExternalLink
                  href={data.productionUrl}
                  label={extractDomain(data.productionUrl)}
                />
              ) : (
                <NotConfigured />
              )
            }
          />

          {/* Deployment Status */}
          <InfrastructureRow
            icon={<Globe className="h-4 w-4 text-gray-600" />}
            label="Deployment Status"
            value={
              data.deploymentTarget ? (
                <DeploymentStatusCell
                  status={data.deploymentTarget.status as DeploymentStatus}
                  lastDeployedAt={data.deploymentTarget.last_deployed_at}
                  targetUrl={data.deploymentTarget.target_url}
                  metadata={data.deploymentTarget.deployment_metadata}
                />
              ) : (
                <NotConfigured label="No deployment target found" />
              )
            }
          />
        </div>
      )}
    </section>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InfrastructureRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3.5 sm:flex-row">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-medium text-gray-700">{label}</dt>
        <dd className="mt-0.5">{value}</dd>
      </div>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
    >
      <span className="truncate max-w-xs">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

// Note: we shadow the import name below — rename to avoid conflict
function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function NotConfigured({ label = 'Not configured' }: { label?: string }) {
  return <span className="text-sm text-gray-400 italic">{label}</span>;
}

function DeploymentStatusCell({
  status,
  lastDeployedAt,
  targetUrl,
  metadata,
}: {
  status: DeploymentStatus;
  lastDeployedAt?: string;
  targetUrl?: string;
  metadata?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <DeploymentStatusBadge status={status} />
        {targetUrl && (
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600"
          >
            View deployment
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
      {lastDeployedAt && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          <span>
            Last deployed{' '}
            {formatDistanceToNow(new Date(lastDeployedAt), { addSuffix: true })}
          </span>
        </div>
      )}
      {metadata?.commit_sha && (
        <p className="text-xs text-gray-400 font-mono">
          {metadata.branch && (
            <span className="mr-2 text-gray-500">{metadata.branch}</span>
          )}
          {metadata.commit_sha.substring(0, 7)}
        </p>
      )}
    </div>
  );
}

function NotProvisionedCard({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
        <AlertCircle className="h-5 w-5 text-gray-400" />
      </div>
      <h3 className="text-sm font-medium text-gray-900">
        Not yet provisioned
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        GitHub and Vercel integrations have not been set up for this project.
        Click below to trigger provisioning.
      </p>
      <div className="mt-4">
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white',
            'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'transition-colors duration-150'
          )}
        >
          {isRetrying ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Provisioning…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Retry Provisioning
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function InfrastructureSectionSkeleton() {
  return (
    <section aria-labelledby="infrastructure-heading" className="space-y-4">
      <div className="space-y-1">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-4 px-4 py-3.5">
            <div className="mt-0.5 h-4 w-4 animate-pulse rounded bg-gray-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
              <div className="h-3.5 w-48 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Vercel logo SVG as a component
function VercelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 76 65"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractRepoName(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parsed.pathname.replace(/^\//, '') || url;
  } catch {
    return url;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
