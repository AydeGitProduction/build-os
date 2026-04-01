// src/hooks/useWorkspaces.ts
import { useState, useEffect, useCallback } from 'react';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string;
  avatarColor?: string;
  role?: 'owner' | 'admin' | 'member';
  plan?: 'free' | 'pro' | 'enterprise';
  memberCount?: number;
}

interface UseWorkspacesReturn {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const STORAGE_KEY = 'activeWorkspaceId';

// Generate a consistent color from workspace name
export function getWorkspaceColor(name: string): string {
  const colors = [
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#f97316', // orange
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f59e0b', // amber
    '#ef4444', // red
    '#3b82f6', // blue
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Get initials from workspace name (max 2 chars)
export function getWorkspaceInitials(name: string): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

async function fetchWorkspaces(): Promise<Workspace[]> {
  const response = await fetch('/api/workspaces', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch workspaces: ${response.status}`);
  }

  const data = await response.json();

  // Handle various API response shapes
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.workspaces)) return data.workspaces;
  if (Array.isArray(data.data)) return data.data;

  throw new Error('Unexpected API response shape');
}

export function useWorkspaces(currentWorkspace?: Partial<Workspace>): UseWorkspacesReturn {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchWorkspaces();

      // Enrich with computed fields
      const enriched = data.map((ws) => ({
        ...ws,
        avatarColor: ws.avatarColor || getWorkspaceColor(ws.name),
      }));

      setWorkspaces(enriched);
      setApiAvailable(true);

      // Set active workspace: stored ID > first in list > current prop
      const storedId = localStorage.getItem(STORAGE_KEY);
      const targetId =
        storedId && enriched.find((ws) => ws.id === storedId)
          ? storedId
          : currentWorkspace?.id || enriched[0]?.id || null;

      setActiveWorkspaceId(targetId);
      if (targetId) {
        localStorage.setItem(STORAGE_KEY, targetId);
      }
    } catch (err) {
      // API not available - fall back to current workspace prop
      setApiAvailable(false);
      setError(null); // Graceful degradation, not an error state

      if (currentWorkspace?.id) {
        const fallback: Workspace = {
          id: currentWorkspace.id,
          name: currentWorkspace.name || 'My Workspace',
          slug: currentWorkspace.slug || 'my-workspace',
          avatarColor: currentWorkspace.avatarColor || getWorkspaceColor(currentWorkspace.name || 'My Workspace'),
          ...currentWorkspace,
        };
        setWorkspaces([fallback]);
        setActiveWorkspaceId(fallback.id);
      } else {
        // Absolute fallback
        const fallback: Workspace = {
          id: 'default',
          name: 'My Workspace',
          slug: 'my-workspace',
          avatarColor: getWorkspaceColor('My Workspace'),
        };
        setWorkspaces([fallback]);
        setActiveWorkspaceId('default');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const target = workspaces.find((ws) => ws.id === workspaceId);
    if (!target) return;

    // Optimistic update
    setActiveWorkspaceId(workspaceId);
    localStorage.setItem(STORAGE_KEY, workspaceId);

    // Optionally notify the server
    if (apiAvailable) {
      try {
        await fetch('/api/workspaces/switch', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId }),
        });
      } catch {
        // Non-fatal: local state already updated
      }
    }
  }, [workspaces, apiAvailable]);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId) || workspaces[0] || null;

  return {
    workspaces,
    activeWorkspace,
    isLoading,
    error,
    switchWorkspace,
    refetch: loadWorkspaces,
  };
}