// apps/web/src/hooks/useProjectPhases.ts
'use client';

import { useState, useEffect } from 'react';
import type { Phase } from '@/types';

interface UseProjectPhasesResult {
  data: Phase[] | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjectPhases(projectId: string | null | undefined): UseProjectPhasesResult {
  const [data, setData] = useState<Phase[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    fetch(`/api/projects/${projectId}/phases`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json.data ?? json ?? null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setIsLoading(false));
  }, [projectId, tick]);

  const refresh = () => setTick((t) => t + 1);

  return { data, isLoading, error, refresh };
}
