// apps/web/src/hooks/useProjectBlueprint.ts
'use client';

import { useState, useEffect } from 'react';
import type { Blueprint } from '@/types';

interface UseProjectBlueprintResult {
  data: Blueprint | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjectBlueprint(projectId: string | null | undefined): UseProjectBlueprintResult {
  const [data, setData] = useState<Blueprint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    fetch(`/api/projects/${projectId}/blueprint`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        // Handles double-envelope: { data: { data: Blueprint } }
        setData(json.data?.data ?? json.data ?? json ?? null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setIsLoading(false));
  }, [projectId, tick]);

  const refresh = () => setTick((t) => t + 1);

  return { data, isLoading, error, refresh };
}
