// src/components/iris/IrisChatHeader.tsx
import React, { useState } from 'react';
import type { Phase } from '@/types/phase';
import { buildTaskSummary } from '@/utils/irisContextBuilder';
import PhaseContextBadge from './PhaseContextBadge';

interface IrisChatHeaderProps {
  selectedPhase: Phase | null;
  onClearMessages?: () => void;
  onToggleContextPanel?: () => void;
  isContextPanelOpen?: boolean;
}

export const IrisChatHeader: React.FC<IrisChatHeaderProps> = ({
  selectedPhase,
  onClearMessages,
  onToggleContextPanel,
  isContextPanelOpen = false,
}) => {
  const [showContextTooltip, setShowContextTooltip] = useState(false);

  const taskSummary = selectedPhase ? buildTaskSummary(selectedPhase) : null;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
      {/* Left: IRIS identity + phase context */}
      <div className="flex items-center gap-3 min-w-0">
        {/* IRIS Logo/Icon */}
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shrink-0 shadow-sm">
          <svg
            className="w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
        </div>

        {/* Title area */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 leading-none">
              IRIS
            </h2>
            <span className="text-xs text-gray-400 leading-none">
              AI Assistant
            </span>
          </div>

          {/* Phase context line */}
          <div className="mt-1.5">
            <PhaseContextBadge phase={selectedPhase} />
          </div>
        </div>
      </div>

      {/* Right: Actions + context panel toggle */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Task progress pill - only when phase selected */}
        {taskSummary && selectedPhase && (
          <div
            className="relative"
            onMouseEnter={() => setShowContextTooltip(true)}
            onMouseLeave={() => setShowContextTooltip(false)}
          >
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="View phase task summary"
            >
              {/* Mini progress bar */}
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${taskSummary.completionPercentage}%` }}
                  />
                </div>
                <span className="tabular-nums text-gray-500">
                  {taskSummary.done}/{taskSummary.total}
                </span>
              </div>
            </button>

            {/* Hover tooltip */}
            {showContextTooltip && (
              <div className="absolute right-0 top-full mt-2 z-50 w-52 bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-xs">
                <p className="font-semibold text-gray-800 mb-2 truncate">
                  {selectedPhase.title}
                </p>
                <div className="space-y-1">
                  {[
                    { label: 'To Do', value: taskSummary.todo, color: 'bg-gray-400' },
                    {
                      label: 'In Progress',
                      value: taskSummary.inProgress,
                      color: 'bg-blue-500',
                    },
                    { label: 'Done', value: taskSummary.done, color: 'bg-emerald-500' },
                    {
                      label: 'Blocked',
                      value: taskSummary.blocked,
                      color: 'bg-red-400',
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${color}`} />
                        <span className="text-gray-600">{label}</span>
                      </div>
                      <span className="font-medium text-gray-800 tabular-nums">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-gray-500">Completion</span>
                  <span className="font-semibold text-violet-600">
                    {taskSummary.completionPercentage}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Context panel toggle */}
        {onToggleContextPanel && (
          <button
            onClick={onToggleContextPanel}
            className={`p-1.5 rounded-md transition-colors ${
              isContextPanelOpen
                ? 'bg-violet-100 text-violet-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            aria-label={isContextPanelOpen ? 'Hide context panel' : 'Show context panel'}
            title="Toggle system context"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </button>
        )}

        {/* Clear messages */}
        {onClearMessages && (
          <button
            onClick={onClearMessages}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Clear chat messages"
            title="Clear conversation"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
};

export default IrisChatHeader;