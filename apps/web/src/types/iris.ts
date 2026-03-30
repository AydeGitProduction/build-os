// apps/web/src/types/iris.ts
// (Ensure these types exist / update as needed)

export interface IrisPreviewPhaseTask {
  id?: string;
  title: string;
  description?: string;
  estimated_hours?: number;
}

export interface IrisPreviewPhase {
  id?: string;
  name: string;
  description?: string;
  order?: number;
  tasks: IrisPreviewPhaseTask[];
}

/**
 * Matches the backend response shape from GET /api/projects/[id]/draft-preview
 */
export interface IrisPreviewData {
  /** Product/project name extracted by IRIS */
  product_name?: string | null;
  /** Core problem being solved */
  problem_statement?: string | null;
  /** Primary target audience */
  target_audience?: string | null;
  /** Planned development phases */
  phases: IrisPreviewPhase[];
  /** Assumptions IRIS made or elicited */
  assumptions: string[];
  /**
   * true  → IRIS is still in discovery (not all required fields collected)
   * false → IRIS has collected all required context; blueprint is complete
   */
  is_partial: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  isError?: boolean;
}

/**
 * Backend response envelope for GET /api/projects/[id]/draft-preview
 */
export interface DraftPreviewResponse {
  data: IrisPreviewData | null;
}