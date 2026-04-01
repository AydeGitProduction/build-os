// src/utils/irisContextBuilder.ts
import type { Phase, PhaseContext, TaskSummary, IrisSystemContext } from '@/types/phase';

const IRIS_BASE_INSTRUCTIONS = `You are IRIS, an intelligent project management assistant. 
You help teams plan, track, and execute their projects effectively.
You provide clear, actionable advice and can analyze project data to surface insights.
Always be concise, professional, and constructive in your responses.`;

/**
 * Builds a TaskSummary from a Phase's tasks array.
 */
export function buildTaskSummary(phase: Phase): TaskSummary {
  const tasks = phase.tasks ?? [];
  const total = tasks.length;

  const counts = tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const done = counts['done'] ?? 0;
  const completionPercentage = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    total,
    todo: counts['todo'] ?? 0,
    inProgress: counts['in-progress'] ?? 0,
    done,
    blocked: counts['blocked'] ?? 0,
    completionPercentage,
  };
}

/**
 * Builds a PhaseContext object from a Phase.
 */
export function buildPhaseContext(phase: Phase): PhaseContext {
  const taskSummary = buildTaskSummary(phase);

  return {
    phaseId: phase.id,
    phaseTitle: phase.title,
    phaseDescription: phase.description ?? 'No description provided.',
    phaseStatus: phase.status,
    taskSummary,
    tasks: (phase.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
  };
}

/**
 * Serializes a PhaseContext into a human-readable context block
 * suitable for injection into an LLM system prompt.
 */
export function serializePhaseContextToPrompt(ctx: PhaseContext): string {
  const { taskSummary } = ctx;

  const taskLines = ctx.tasks
    .map(
      (t) =>
        `  - [${t.status.toUpperCase()}${t.priority ? ` | ${t.priority} priority` : ''}] ${t.title}`
    )
    .join('\n');

  return `
## Current Phase Context
**Phase:** ${ctx.phaseTitle}
**Status:** ${ctx.phaseStatus}
**Description:** ${ctx.phaseDescription}

### Task Summary
- Total Tasks: ${taskSummary.total}
- To Do: ${taskSummary.todo}
- In Progress: ${taskSummary.inProgress}
- Done: ${taskSummary.done}
- Blocked: ${taskSummary.blocked}
- Completion: ${taskSummary.completionPercentage}%

### Task List
${taskLines || '  (No tasks in this phase yet)'}
`.trim();
}

/**
 * Builds the full IRIS system prompt string given an optional selected phase.
 */
export function buildIrisSystemPrompt(selectedPhase: Phase | null): string {
  if (!selectedPhase) {
    return `${IRIS_BASE_INSTRUCTIONS}

No specific phase is currently selected. You can help with general project management questions or ask the user to select a phase for more contextual assistance.`;
  }

  const phaseContext = buildPhaseContext(selectedPhase);
  const phasePromptBlock = serializePhaseContextToPrompt(phaseContext);

  return `${IRIS_BASE_INSTRUCTIONS}

${phasePromptBlock}

Use this phase context to provide targeted, relevant assistance. Reference specific tasks and phase details when answering questions.`;
}

/**
 * Builds the complete IrisSystemContext object.
 */
export function buildIrisSystemContext(selectedPhase: Phase | null): IrisSystemContext {
  return {
    baseInstructions: IRIS_BASE_INSTRUCTIONS,
    phaseContext: selectedPhase ? buildPhaseContext(selectedPhase) : undefined,
  };
}