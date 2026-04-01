// src/types/phase.ts
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  priority?: 'low' | 'medium' | 'high';
  assignee?: string;
  dueDate?: string;
  tags?: string[];
}

export interface Phase {
  id: string;
  title: string;
  description?: string;
  status: 'planned' | 'active' | 'completed' | 'archived';
  order: number;
  tasks: Task[];
  startDate?: string;
  endDate?: string;
  color?: string;
  icon?: string;
}

export interface IrisSystemContext {
  baseInstructions: string;
  phaseContext?: PhaseContext;
}

export interface PhaseContext {
  phaseId: string;
  phaseTitle: string;
  phaseDescription: string;
  phaseStatus: Phase['status'];
  taskSummary: TaskSummary;
  tasks: TaskContextItem[];
}

export interface TaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  blocked: number;
  completionPercentage: number;
}

export interface TaskContextItem {
  id: string;
  title: string;
  status: Task['status'];
  priority?: Task['priority'];
}