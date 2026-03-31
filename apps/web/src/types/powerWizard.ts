// apps/web/src/types/powerWizard.ts
// RENAMED: was autopilot types → powerWizard types
// All UI-facing type names updated.

// ─── Config Types ──────────────────────────────────────────────────────────────

export type PowerWizardGoal = "efficiency" | "quality" | "speed" | "cost";

export type PowerWizardFrequency = "hourly" | "daily" | "weekly" | "on-demand";

export interface PowerWizardSchedule {
  frequency: PowerWizardFrequency;
  startTime?: string;
  timezone?: string;
}

export interface PowerWizardRules {
  autoPrioritize: boolean;
  smartNotifications: boolean;
  adaptiveLearning: boolean;
}

export interface PowerWizardConfig {
  goals: PowerWizardGoal[];
  schedule: PowerWizardSchedule;
  rules: PowerWizardRules;
}

// ─── State Types ───────────────────────────────────────────────────────────────

export type PowerWizardStatus =
  | "idle"
  | "loading"
  | "running"
  | "paused"
  | "error"
  | "completed";

export interface PowerWizardState {
  goals?: PowerWizardGoal[];
  schedule?: PowerWizardSchedule;
  rules?: PowerWizardRules;
  status: PowerWizardStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

// ─── Action Types ──────────────────────────────────────────────────────────────

export type PowerWizardAction =
  | { type: "TOGGLE_GOAL"; payload: PowerWizardGoal }
  | { type: "SET_FREQUENCY"; payload: PowerWizardFrequency }
  | { type: "TOGGLE_AUTO_PRIORITIZE" }
  | { type: "TOGGLE_SMART_NOTIFICATIONS" }
  | { type: "TOGGLE_ADAPTIVE_LEARNING" }
  | { type: "SET_STATUS"; payload: PowerWizardStatus }
  | { type: "SET_LAST_RUN"; payload: string }
  | { type: "SET_NEXT_RUN"; payload: string }
  | { type: "RESET" };