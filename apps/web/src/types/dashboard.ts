// src/types/dashboard.ts  (additions / extensions)

export interface Phase {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'in_progress' | 'started' | 'completed' | 'paused';
  order?: number;       // e.g. 1, 2, 3
  number?: number;      // alias
  completionPercentage?: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Blueprint {
  id: string;
  projectId: string;
  title?: string;
  status: 'draft' | 'ready' | 'active';
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}