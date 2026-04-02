// src/hooks/useIntegrations.ts

import useSWR from 'swr';
import { useCallback, useState } from 'react';
import type {
  IntegrationsResponse,
  TestConnectionResult,
  ProviderWithConnection,
} from '@/types/integrations';

const POLL_INTERVAL = 30_000; // 30 seconds

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const error = new Error('API request failed');
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res.json();
}

export function useIntegrations() {
  const { data, error, isLoading, mutate } = useSWR<IntegrationsResponse>(
    '/api/integrations',
    fetcher,
    {
      refreshInterval: POLL_INTERVAL,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5_000,
    }
  );

  return {
    providers: data?.providers ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useTestConnection() {
  const [testing, setTesting] = useState<Set<string>>(new Set());

  const testConnection = useCallback(
    async (connectionId: string): Promise<TestConnectionResult> => {
      setTesting((prev) => new Set(prev).add(connectionId));
      try {
        const res = await fetch('/api/integrations/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connectionId }),
        });
        if (!res.ok) throw new Error('Test request failed');
        return res.json();
      } finally {
        setTesting((prev) => {
          const next = new Set(prev);
          next.delete(connectionId);
          return next;
        });
      }
    },
    []
  );

  return { testConnection, testing };
}

export function useDisconnect() {
  const [disconnecting, setDisconnecting] = useState<Set<string>>(new Set());

  const disconnect = useCallback(async (connectionId: string): Promise<void> => {
    setDisconnecting((prev) => new Set(prev).add(connectionId));
    try {
      const res = await fetch(`/api/integrations/connections/${connectionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Disconnect failed');
    } finally {
      setDisconnecting((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  }, []);

  return { disconnect, disconnecting };
}

// Optimistic update helper
export function useIntegrationsWithActions() {
  const { providers, isLoading, error, refresh } = useIntegrations();
  const { testConnection, testing } = useTestConnection();
  const { disconnect, disconnecting } = useDisconnect();

  const handleTest = useCallback(
    async (provider: ProviderWithConnection): Promise<TestConnectionResult> => {
      if (!provider.connection) throw new Error('No connection to test');

      const result = await testConnection(provider.connection.id);

      // Optimistic revalidation
      await refresh();

      return result;
    },
    [testConnection, refresh]
  );

  const handleDisconnect = useCallback(
    async (provider: ProviderWithConnection): Promise<void> => {
      if (!provider.connection) throw new Error('No connection to disconnect');

      await disconnect(provider.connection.id);
      await refresh();
    },
    [disconnect, refresh]
  );

  return {
    providers,
    isLoading,
    error,
    refresh,
    handleTest,
    handleDisconnect,
    testing,
    disconnecting,
  };
}