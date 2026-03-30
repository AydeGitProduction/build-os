// apps/web/src/lib/wizard-readiness.ts
/**
 * Wizard Readiness Scoring Utility
 * 
 * Computes a readiness score (0–100) for IRIS wizard completion based on
 * which fields have been gathered and how complete they are.
 * 
 * Used by:
 *  - IRIS route server-side completeness gate (I5-BE)
 *  - Client-side progress indicators (I3-FE)
 *  - Analytics / reporting pipelines
 */

// ---------------------------------------------------------------------------
// Field Registry
// ---------------------------------------------------------------------------

/**
 * All fields IRIS collects, with weights and hard-required flags.
 *
 * Total weight of all fields sums to 100.
 * Hard-required fields (required: true) must be present for score >= threshold.
 */
export interface FieldDefinition {
  key: string;
  label: string;
  weight: number;       // Contribution to score when fully present (0–100 total)
  required: boolean;    // If true, absence blocks completion regardless of score
  minLength?: number;   // Minimum string length to count as "gathered"
}

export const FIELD_REGISTRY: FieldDefinition[] = [
  {
    key: "product_name",
    label: "Product Name",
    weight: 10,
    required: false,
    minLength: 2,
  },
  {
    key: "core_problem",
    label: "Core Problem",
    weight: 25,
    required: true,   // Hard required: must be present
    minLength: 10,
  },
  {
    key: "target_audience",
    label: "Target Audience",
    weight: 20,
    required: true,   // Hard required
    minLength: 5,
  },
  {
    key: "proposed_solution",
    label: "Proposed Solution",
    weight: 20,
    required: false,
    minLength: 10,
  },
  {
    key: "success_metrics",
    label: "Success Metrics",
    weight: 10,
    required: false,
    minLength: 5,
  },
  {
    key: "constraints",
    label: "Constraints / Budget / Timeline",
    weight: 8,
    required: false,
    minLength: 3,
  },
  {
    key: "competitive_landscape",
    label: "Competitive Landscape",
    weight: 7,
    required: false,
    minLength: 3,
  },
];

// Convenience set of all field keys
export const ALL_FIELD_KEYS = FIELD_REGISTRY.map((f) => f.key);

// Hard-required field keys
export const REQUIRED_FIELD_KEYS = FIELD_REGISTRY
  .filter((f) => f.required)
  .map((f) => f.key);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CollectedFields = Record<string, string | undefined | null>;

export interface ReadinessResult {
  score: number;                   // 0–100
  collectedCount: number;          // How many fields have a value
  totalFields: number;             // Total fields in registry
  missingRequired: string[];       // Labels of hard-required fields that are missing
  missingFields: string[];         // Labels of ALL missing fields
  missingFieldKeys: string[];      // Keys of all missing fields
  isEligible: boolean;             // score >= threshold AND no missing required fields
}

// ---------------------------------------------------------------------------
// Core Scoring Function
// ---------------------------------------------------------------------------

/**
 * Computes a readiness score from 0–100 based on which fields are collected.
 *
 * A field is considered "gathered" if:
 *   - Its value exists (non-null, non-undefined, non-empty string)
 *   - Its string length meets the minLength requirement (if specified)
 *
 * @param collectedFields  Key-value map of gathered fields
 * @returns                Numeric score 0–100
 */
export function computeReadiness(collectedFields: CollectedFields): number {
  return computeReadinessDetails(collectedFields).score;
}

/**
 * Full readiness computation returning detailed breakdown.
 * Prefer this when you need to know which fields are missing.
 *
 * @param collectedFields  Key-value map of gathered fields
 * @param threshold        Score threshold for eligibility (default 70)
 */
export function computeReadinessDetails(
  collectedFields: CollectedFields,
  threshold = 70
): ReadinessResult {
  let score = 0;
  let collectedCount = 0;
  const missingRequired: string[] = [];
  const missingFields: string[] = [];
  const missingFieldKeys: string[] = [];

  for (const field of FIELD_REGISTRY) {
    const value = collectedFields[field.key];
    const isGathered = isFieldGathered(value, field.minLength);

    if (isGathered) {
      score += field.weight;
      collectedCount++;
    } else {
      missingFields.push(field.label);
      missingFieldKeys.push(field.key);
      if (field.required) {
        missingRequired.push(field.label);
      }
    }
  }

  // Clamp to [0, 100]
  score = Math.max(0, Math.min(100, score));

  const isEligible = score >= threshold && missingRequired.length === 0;

  return {
    score,
    collectedCount,
    totalFields: FIELD_REGISTRY.length,
    missingRequired,
    missingFields,
    missingFieldKeys,
    isEligible,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determines whether a single field value counts as "gathered".
 */
export function isFieldGathered(
  value: string | undefined | null,
  minLength = 1
): boolean {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  return trimmed.length >= minLength;
}

/**
 * Returns a human-readable description of missing fields for the LLM to use
 * when asking follow-up questions.
 */
export function describeMissingFields(result: ReadinessResult): string {
  if (result.missingFields.length === 0) return "";
  if (result.missingFields.length === 1) return result.missingFields[0];
  const last = result.missingFields[result.missingFields.length - 1];
  const rest = result.missingFields.slice(0, -1).join(", ");
  return `${rest} and ${last}`;
}

/**
 * Returns the first missing required field label (if any), otherwise the
 * first missing optional field label. Used to direct the next question.
 */
export function getFirstMissingFieldLabel(result: ReadinessResult): string {
  if (result.missingRequired.length > 0) return result.missingRequired[0];
  if (result.missingFields.length > 0) return result.missingFields[0];
  return "";
}

/**
 * Returns the first missing field key for use in structured responses.
 */
export function getFirstMissingFieldKey(result: ReadinessResult): string {
  if (result.missingRequired.length > 0) {
    const requiredKey = FIELD_REGISTRY.find(
      (f) => f.required && !isFieldGathered(undefined)
    );
    // Find the key for the first missing required label
    const label = result.missingRequired[0];
    const field = FIELD_REGISTRY.find((f) => f.label === label);
    return field?.key ?? result.missingFieldKeys[0] ?? "";
  }
  return result.missingFieldKeys[0] ?? "";
}