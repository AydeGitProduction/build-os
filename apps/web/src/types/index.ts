// apps/web/src/types/index.ts
// UPDATED: Autopilot type exports replaced with PowerWizard exports

// ─── Power Wizard (was: Autopilot) ────────────────────────────────────────────
export type {
  PowerWizardGoal,
  PowerWizardFrequency,
  PowerWizardSchedule,
  PowerWizardRules,
  PowerWizardConfig,
  PowerWizardStatus,
  PowerWizardState,
  PowerWizardAction,
} from "./powerWizard";

// DEPRECATED ALIASES — kept temporarily for gradual migration
// Remove after all consumers updated
// export type { AutopilotConfig, AutopilotState } from "./autopilot"; // ← REMOVED

// ─── Other types (unchanged) ──────────────────────────────────────────────────
export * from "./user";
export * from "./dashboard";
export * from "./notifications";
// ... other existing exports unchanged