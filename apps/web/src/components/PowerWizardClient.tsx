// apps/web/src/components/PowerWizardClient.tsx
// RENAMED: was AutopilotClient.tsx → PowerWizardClient.tsx
// Route: /autopilot → /wizard
// All UI labels updated. Backend dispatch logic untouched.

"use client";

import React, { useState, useCallback } from "react";
import { usePowerWizard } from "@/hooks/usePowerWizard";
import type { PowerWizardConfig, PowerWizardState } from "@/types";

interface PowerWizardClientProps {
  initialConfig?: Partial<PowerWizardConfig>;
  onComplete?: (state: PowerWizardState) => void;
}

export function PowerWizardClient({
  initialConfig,
  onComplete,
}: PowerWizardClientProps) {
  const { state, dispatch, reset, isLoading, error } =
    usePowerWizard(initialConfig);

  const [step, setStep] = useState<number>(0);

  const handleNext = useCallback(() => {
    setStep((prev) => prev + 1);
  }, []);

  const handleBack = useCallback(() => {
    setStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleComplete = useCallback(() => {
    onComplete?.(state);
  }, [state, onComplete]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">
            Loading Power Wizard...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h3 className="font-semibold text-destructive">
          Power Wizard Error
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Restart Power Wizard
        </button>
      </div>
    );
  }

  return (
    <div className="power-wizard-container flex flex-col gap-6">
      {/* Header */}
      <div className="power-wizard-header">
        <h2 className="text-2xl font-bold tracking-tight">Power Wizard</h2>
        <p className="text-muted-foreground">
          Step {step + 1} — Configure your workflow intelligently
        </p>
      </div>

      {/* Progress Indicator */}
      <PowerWizardProgress currentStep={step} totalSteps={4} />

      {/* Step Content */}
      <div className="power-wizard-body rounded-lg border bg-card p-6 shadow-sm">
        <PowerWizardStep
          step={step}
          state={state}
          dispatch={dispatch}
        />
      </div>

      {/* Navigation */}
      <div className="power-wizard-nav flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-accent"
        >
          Back
        </button>

        {step < 3 ? (
          <button
            onClick={handleNext}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleComplete}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Launch Power Wizard
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

interface PowerWizardProgressProps {
  currentStep: number;
  totalSteps: number;
}

function PowerWizardProgress({
  currentStep,
  totalSteps,
}: PowerWizardProgressProps) {
  return (
    <div className="power-wizard-progress flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={`h-2 flex-1 rounded-full transition-colors ${
              i <= currentStep ? "bg-primary" : "bg-muted"
            }`}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

interface PowerWizardStepProps {
  step: number;
  state: PowerWizardState;
  dispatch: ReturnType<typeof usePowerWizard>["dispatch"];
}

function PowerWizardStep({ step, state, dispatch }: PowerWizardStepProps) {
  switch (step) {
    case 0:
      return <PowerWizardStepGoals state={state} dispatch={dispatch} />;
    case 1:
      return <PowerWizardStepSchedule state={state} dispatch={dispatch} />;
    case 2:
      return <PowerWizardStepRules state={state} dispatch={dispatch} />;
    case 3:
      return <PowerWizardStepReview state={state} dispatch={dispatch} />;
    default:
      return null;
  }
}

// Step 0: Goals
function PowerWizardStepGoals({
  state,
  dispatch,
}: Omit<PowerWizardStepProps, "step">) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Define Your Goals</h3>
      <p className="text-sm text-muted-foreground">
        Tell Power Wizard what you want to achieve. It will configure
        everything automatically based on your objectives.
      </p>
      <div className="grid gap-3">
        {(["efficiency", "quality", "speed", "cost"] as const).map((goal) => (
          <label
            key={goal}
            className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-primary"
              checked={state.goals?.includes(goal) ?? false}
              onChange={() =>
                dispatch({ type: "TOGGLE_GOAL", payload: goal })
              }
            />
            <span className="capitalize text-sm font-medium">{goal}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Step 1: Schedule
function PowerWizardStepSchedule({
  state,
  dispatch,
}: Omit<PowerWizardStepProps, "step">) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Set Your Schedule</h3>
      <p className="text-sm text-muted-foreground">
        Power Wizard will run automatically on the schedule you define.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["hourly", "daily", "weekly", "on-demand"] as const).map(
          (frequency) => (
            <label
              key={frequency}
              className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors hover:bg-accent ${
                state.schedule?.frequency === frequency
                  ? "border-primary bg-primary/5"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="frequency"
                className="h-4 w-4"
                checked={state.schedule?.frequency === frequency}
                onChange={() =>
                  dispatch({ type: "SET_FREQUENCY", payload: frequency })
                }
              />
              <span className="capitalize text-sm font-medium">
                {frequency}
              </span>
            </label>
          )
        )}
      </div>
    </div>
  );
}

// Step 2: Rules
function PowerWizardStepRules({
  state,
  dispatch,
}: Omit<PowerWizardStepProps, "step">) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Configure Rules</h3>
      <p className="text-sm text-muted-foreground">
        Power Wizard uses these rules to make intelligent decisions.
      </p>
      <div className="space-y-3">
        <label className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Auto-prioritize tasks</p>
            <p className="text-xs text-muted-foreground">
              Automatically sort by urgency and impact
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={state.rules?.autoPrioritize ?? false}
            onChange={() => dispatch({ type: "TOGGLE_AUTO_PRIORITIZE" })}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Smart notifications</p>
            <p className="text-xs text-muted-foreground">
              Only notify on critical events
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={state.rules?.smartNotifications ?? false}
            onChange={() => dispatch({ type: "TOGGLE_SMART_NOTIFICATIONS" })}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Adaptive learning</p>
            <p className="text-xs text-muted-foreground">
              Improve over time based on your feedback
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={state.rules?.adaptiveLearning ?? false}
            onChange={() => dispatch({ type: "TOGGLE_ADAPTIVE_LEARNING" })}
          />
        </label>
      </div>
    </div>
  );
}

// Step 3: Review
function PowerWizardStepReview({
  state,
}: Omit<PowerWizardStepProps, "step">) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Review & Launch</h3>
      <p className="text-sm text-muted-foreground">
        Review your Power Wizard configuration before launching.
      </p>
      <div className="rounded-md bg-muted/50 p-4 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Goals:</span>
          <span className="font-medium capitalize">
            {state.goals?.join(", ") || "None selected"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Frequency:</span>
          <span className="font-medium capitalize">
            {state.schedule?.frequency || "Not set"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Auto-prioritize:</span>
          <span className="font-medium">
            {state.rules?.autoPrioritize ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Smart notifications:</span>
          <span className="font-medium">
            {state.rules?.smartNotifications ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Adaptive learning:</span>
          <span className="font-medium">
            {state.rules?.adaptiveLearning ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PowerWizardClient;