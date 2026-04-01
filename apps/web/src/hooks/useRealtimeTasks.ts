// apps/web/src/hooks/useRealtimeTasks.ts
import { useEffect, useState, useCallback } from 'react';
import { Task, TaskStatus } from '../types/task';
import { supabase } from '../lib/supabase';

interface UseRealtimeTasksOptions {
  projectId?: string;
  runId?: string;
  enabled?: boolean;
}

interface UseRealtimeTasksReturn {
  tasks: Task[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRealtimeTasks(
  options: UseRealtimeTasksOptions = {}
): UseRealtimeTasksReturn {
  const { projectId, runId, enabled = true } = options;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setIsLoading(true);
      setError(null);

      let query = supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      if (runId) {
        query = query.eq('run_id', runId);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw new Error(queryError.message);
      setTasks((data as Task[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tasks'));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, runId, enabled]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!enabled) return;

    const channelName = [
      'realtime:tasks',
      projectId,
      runId,
    ]
      .filter(Boolean)
      .join(':');

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}),
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          setTasks((prev) => {
            switch (eventType) {
              case 'INSERT':
                return [newRecord as Task, ...prev];
              case 'UPDATE':
                return prev.map((t) =>
                  t.id === (newRecord as Task).id ? (newRecord as Task) : t
                );
              case 'DELETE':
                return prev.filter((t) => t.id !== (oldRecord as Task).id);
              default:
                return prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, runId, enabled]);

  return { tasks, isLoading, error, refetch: fetchTasks };
}