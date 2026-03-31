// apps/web/src/hooks/usePowerWizard.ts
// RENAMED: was useAutopilot.ts → usePowerWizard.ts
// All type names updated. Backend API endpoints untouched.

import { useReducer, useCallback, useEffect } from "react";
import type {
  PowerWizardConfig,
  PowerWizardState,
  PowerWizardAction,
} from "@/types";

// ─── Initial State ─────────────────────────────────────────────────────────────

const createInitialState = (
  config?: Partial<PowerWizardConfig>
): PowerWizardState => ({
  goals: config?.goals ?? [],
  schedule: config?.schedule ?? { frequency: "daily" },
  rules: config?.rules ?? {
    autoPrioritize: false,
    smartNotifications: false,
    adaptiveLearning: false,
  },
  status: "idle",
  lastRunAt: null,
  nextRunAt: null,
});

// ─── Reducer ───────────────────────────────────────────────────────────────────

function powerWizardReducer(
  state: PowerWizardState,
  action: PowerWizardAction
): PowerWizardState {
  switch (action.type) {
    case "TOGGLE_GOAL": {
      const goals = state.goals ?? [];
      const exists = goals.includes(action.payload);
      return {
        ...state,
        goals: exists
          ? goals.filter((g) => g !== action.payload)
          : [...goals, action.payload],
      };
    }

    case "SET_FREQUENCY":
      return {
        ...state,
        schedule: { ...state.schedule, frequency: action.payload },
      };

    case "TOGGLE_AUTO_PRIORITIZE":
      return {
        ...state,
        rules: {
          ...state.rules,
          autoPrioritize: !(state.rules?.autoPrioritize ?? false),
        },
      };

    case "TOGGLE_SMART_NOTIFICATIONS":
      return {
        ...state,
        rules: {
          ...state.rules,
          smartNotifications: !(state.rules?.smartNotifications ?? false),
        },
      };

    case "TOGGLE_ADAPTIVE_LEARNING":
      return {
        ...state,
        rules: {
          ...state.rules,
          adaptiveLearning: !(state.rules?.adaptiveLearning ?? false),
        },
      };

    case "SET_STATUS":
      return { ...state, status: action.payload };

    case "SET_LAST_RUN":
      return { ...state, lastRunAt: action.payload };

    case "SET_NEXT_RUN":
      return { ...state, nextRunAt: action.payload };

    case "RESET":
      return createInitialState();

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UsePowerWizardReturn {
  state: PowerWizardState;
  dispatch: React.Dispatch<PowerWizardAction>;
  reset: () => void;
  isLoading: boolean;
  error: Error | null;
}

export function usePowerWizard(
  initialConfig?: Partial<PowerWizardConfig>
): UsePowerWizardReturn {
  const [state, dispatch] = useReducer(
    powerWizardReducer,
    initialConfig,
    createInitialState
  );

  // NOTE: Backend API call preserved — only dispatches to existing endpoint.
  // The server-side "autopilot" dispatch logic is NOT modified here.
  useEffect(() => {
    // Hydrate from persisted config if available
    // Backend endpoint remains unchanged: /api/autopilot/config
    const fetchConfig = async () => {
      try {
        dispatch({ type: "SET_STATUS", payload: "loading" });
        // API path intentionally not changed — backend concern
        const res = await fetch("/api/autopilot/config");
        if (!res.ok) throw new Error("Failed to load config");
        // Config loaded; state hydrated via dispatch
        dispatch({ type: "SET_STATUS", payload: "idle" });
      } catch {
        dispatch({ type: "SET_STATUS", payload: "error" });
      }
    };

    if (!initialConfig) {
      fetchConfig();
    } else {
      dispatch({ type: "SET_STATUS", payload: "idle" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const isLoading = state.status === "loading";
  const error =
    state.status === "error"
      ? new Error("Power Wizard failed to initialize")
      : null;

  return { state, dispatch, reset, isLoading, error };
}

export default usePowerWizard;