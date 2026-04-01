// src/components/layout/TopBar.tsx

import React from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { normalizeStatus } from '../../utils/status-display';
import type { Project } from '../../types';

interface TopBarProps {
  project?: Project;
  title?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  title,
  breadcrumbs = [],
  actions,
}) => {
  const displayTitle = title ?? project?.name ?? 'Untitled';
  const hasStatus = !!(project?.status);

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-gray-200
                 bg-white/80 px-6 backdrop-blur-sm
                 dark:border-gray-700 dark:bg-gray-950/80"
      role="banner"
    >
      {/* ── Left: breadcrumbs + title ── */}
      <div className="flex flex-1 items-center gap-2 min-w-0 overflow-hidden">
        {/* Breadcrumb trail */}
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.label}>
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500
                               dark:hover:text-gray-300 transition-colors"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {crumb.label}
                  </span>
                )}
                {idx < breadcrumbs.length - 1 && (
                  <span className="text-gray-300 dark:text-gray-600 text-xs" aria-hidden="true">
                    /
                  </span>
                )}
              </React.Fragment>
            ))}

            {/* Separator before title */}
            <span className="text-gray-300 dark:text-gray-600 text-xs" aria-hidden="true">
              /
            </span>
          </nav>
        )}

        {/* Page / project title */}
        <h1
          className="text-sm font-semibold text-gray-900 dark:text-white truncate"
          title={displayTitle}
        >
          {displayTitle}
        </h1>

        {/* STATUS BADGE — centralized, shown inline next to title */}
        {hasStatus && (
          <StatusBadge
            status={project!.status}
            size="sm"
            className="shrink-0 ml-1"
          />
        )}
      </div>

      {/* ── Right: action buttons slot ── */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
};

export default TopBar;