// apps/web/src/types/task.ts (reference - likely already exists)
export type TaskStatus = 
  | 'pending' 
  | 'ready' 
  | 'dispatched' 
  | 'in_progress' 
  | 'completed' 
  | 'blocked' 
  | 'failed';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  agent_role?: string;
  created_at: string;
  updated_at: string;
  project_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown>;
}