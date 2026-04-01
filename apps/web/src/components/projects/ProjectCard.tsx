// src/components/projects/ProjectCard.tsx
'use client'

import React from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { normalizeStatus } from '../../utils/status-display';
import type { Project } from '../../types';

interface ProjectCardProps {
  project: Project;
  onClick?: (projectId: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  // Normalize once so all derived logic also uses the canonical value
  const canonicalStatus = normalizeStatus(project.status);

  return (
    <article
      className="group relative flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5
                 shadow-sm transition-shadow hover:shadow-md cursor-pointer
                 dark:border-gray-700 dark:bg-gray-900"
      onClick={() => onClick?.(project.id)}
      aria-label={`Project: ${project.name}, status: ${canonicalStatus}`}
    >
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 flex-1">
          {project.name}
        </h3>

        {/* STATUS BADGE — uses centralized utility */}
        <StatusBadge status={project.status} size="sm" />
      </div>

      {/* ── Description ── */}
      {project.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">
          {project.description}
        </p>
      )}

      {/* ── Meta row ── */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
        {/* Phase count */}
        {typeof project.phaseCount === 'number' && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {project.phaseCount} phase{project.phaseCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Task summary */}
        {typeof project.taskCount === 'number' && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {project.completedTaskCount ?? 0}/{project.taskCount} tasks
          </span>
        )}

        {/* Owner avatar placeholder */}
        {project.ownerInitials && (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full
                       bg-indigo-100 text-indigo-700 text-[9px] font-bold
                       dark:bg-indigo-900/40 dark:text-indigo-300"
            title={project.ownerName}
            aria-label={`Owner: ${project.ownerName}`}
          >
            {project.ownerInitials}
          </span>
        )}
      </div>
    </article>
  );
};

export default ProjectCard;