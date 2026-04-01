// src/components/workspace/WorkspaceAvatar.tsx
import React from 'react';
import { getWorkspaceInitials, getWorkspaceColor } from '../../hooks/useWorkspaces';
import type { Workspace } from '../../hooks/useWorkspaces';

interface WorkspaceAvatarProps {
  workspace: Workspace;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: { container: 'w-5 h-5', text: 'text-[9px]' },
  sm: { container: 'w-7 h-7', text: 'text-[11px]' },
  md: { container: 'w-8 h-8', text: 'text-xs' },
  lg: { container: 'w-10 h-10', text: 'text-sm' },
};

export function WorkspaceAvatar({
  workspace,
  size = 'md',
  className = '',
}: WorkspaceAvatarProps) {
  const { container, text } = sizeMap[size];
  const initials = getWorkspaceInitials(workspace.name);
  const color = workspace.avatarColor || getWorkspaceColor(workspace.name);

  if (workspace.avatarUrl) {
    return (
      <img
        src={workspace.avatarUrl}
        alt={workspace.name}
        className={`${container} rounded-md object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      className={`${container} rounded-md flex items-center justify-center flex-shrink-0 font-semibold text-white select-none ${text} ${className}`}
      style={{ backgroundColor: color }}
      aria-label={workspace.name}
      role="img"
    >
      {initials}
    </span>
  );
}