// src/hooks/__tests__/useDashboardCTA.test.ts

import { renderHook } from '@testing-library/react';
import { useDashboardCTA } from '../useDashboardCTA';
import type { Project, Phase, Blueprint } from '@/types';

const mockProject: Project = {
  id: 'proj-123',
  name: 'Test Project',
  status: 'active',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockActivePhase: Phase = {
  id: 'phase-abc',
  title: 'Discovery & Architecture',
  status: 'active',
  order: 1,
  completionPercentage: 42,
  projectId: 'proj-123',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockBlueprint: Blueprint = {
  id: 'bp-xyz',
  projectId: 'proj-123',
  status: 'ready',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

describe('useDashboardCTA', () => {
  describe('continue-phase variant', () => {
    it('returns continue-phase when active phase exists', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [mockActivePhase],
          blueprint: mockBlueprint,
        })
      );
      expect(result.current.variant).toBe('continue-phase');
    });

    it('generates correct href with phase id', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [mockActivePhase],
        })
      );
      expect(result.current.href).toBe(
        '/projects/proj-123/wizard?phase=phase-abc'
      );
    });

    it('includes phase order in label', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [mockActivePhase],
        })
      );
      expect(result.current.label).toContain('1');
    });

    it('picks first active phase among multiple', () => {
      const phases: Phase[] = [
        { ...mockActivePhase, id: 'p1', order: 1, status: 'completed' },
        { ...mockActivePhase, id: 'p2', order: 2, status: 'active' },
        { ...mockActivePhase, id: 'p3', order: 3, status: 'pending' },
      ];
      const { result } = renderHook(() =>
        useDashboardCTA({ project: mockProject, phases })
      );
      expect(result.current.href).toContain('phase=p2');
    });

    it('handles in_progress status', () => {
      const phase = { ...mockActivePhase, status: 'in_progress' as const };
      const { result } = renderHook(() =>
        useDashboardCTA({ project: mockProject, phases: [phase] })
      );
      expect(result.current.variant).toBe('continue-phase');
    });
  });

  describe('open-wizard variant', () => {
    it('returns open-wizard when blueprint exists and no active phase', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [],
          blueprint: mockBlueprint,
        })
      );
      expect(result.current.variant).toBe('open-wizard');
    });

    it('returns open-wizard with completed-only phases', () => {
      const completedPhase: Phase = {
        ...mockActivePhase,
        status: 'completed',
      };
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [completedPhase],
          blueprint: mockBlueprint,
        })
      );
      expect(result.current.variant).toBe('open-wizard');
    });

    it('href points to wizard without phase param', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [],
          blueprint: mockBlueprint,
        })
      );
      expect(result.current.href).toBe('/projects/proj-123/wizard');
      expect(result.current.href).not.toContain('phase=');
    });
  });

  describe('start-building variant', () => {
    it('returns start-building when no phases and no blueprint', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({
          project: mockProject,
          phases: [],
          blueprint: null,
        })
      );
      expect(result.current.variant).toBe('start-building');
    });

    it('returns start-building with default empty args', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({ project: mockProject })
      );
      expect(result.current.variant).toBe('start-building');
    });

    it('uses gray status color', () => {
      const { result } = renderHook(() =>
        useDashboardCTA({ project: mockProject })
      );
      expect(result.current.statusColor).toBe('gray');
    });
  });
});