// src/components/iris/IrisContextPanel.tsx
import React from 'react';
import type { IrisSystemContext } from '@/types/phase';

interface IrisContextPanelProps {
  systemContext: IrisSystemContext;
  systemPrompt: string;
  isOpen: boolean;
}

export const IrisContextPanel: React.FC<IrisContextPanelProps> = ({
  systemContext,
  systemPrompt,
  isOpen,
}) => {
  if (!isOpen) return null;

  const { phaseContext } = systemContext;

  return (
    <aside className="border-l border-gray-200 bg-gray-50 w-72 shrink-0 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          System Context
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          What IRIS currently knows
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Phase Context */}
        {phaseContext ? (
          <section>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Active Phase
            </h4>
            <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
              <div>
                <p className="text-xs text-gray-400">Title</p>
                <p className="text-sm font-medium text-gray-800">
                  {phaseContext.phaseTitle}
                </p>
              </div>
              {phaseContext.phaseDescription &&
                phaseContext.phaseDescription !== 'No description provided.' && (
                  <div>
                    <p className="text-xs text-gray-400">Description</p>
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {phaseContext.phaseDescription}
                    </p>
                  </div>
                )}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Task Breakdown</p>
                <div className="space-y-1">
                  {[
                    {
                      label: 'To Do',
                      value: phaseContext.taskSummary.todo,
                      bar: 'bg-gray-300',
                    },
                    {
                      label: 'In Progress',
                      value: phaseContext.taskSummary.inProgress,
                      bar: 'bg-blue-400',
                    },
                    {
                      label: 'Done',
                      value: phaseContext.taskSummary.done,
                      bar: 'bg-emerald-400',
                    },
                    {
                      label: 'Blocked',
                      value: phaseContext.taskSummary.blocked,
                      bar: 'bg-red-400',
                    },
                  ].map(({ label, value, bar }) => {
                    const pct =
                      phaseContext.taskSummary.total > 0
                        ? (value / phaseContext.taskSummary.total) * 100
                        : 0;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-20 shrink-0">
                          {label}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${bar} rounded-full transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums w-4 text-right">
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section>
            <div className="bg-white rounded-lg border border-dashed border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400">No phase selected</p>
              <p className="text-xs text-gray-400 mt-1">
                Select a phase to give IRIS full context
              </p>
            </div>
          </section>
        )}

        {/* Raw System Prompt (collapsible) */}
        <section>
          <details className="group">
            <summary className="text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 list-none flex items-center justify-between">
              <span>System Prompt</span>
              <svg
                className="w-3 h-3 text-gray-400 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </summary>
            <div className="mt-2 bg-gray-900 rounded-lg p-3 overflow-x-auto">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {systemPrompt}
              </pre>
            </div>
          </details>
        </section>
      </div>
    </aside>
  );
};

export default IrisContextPanel;