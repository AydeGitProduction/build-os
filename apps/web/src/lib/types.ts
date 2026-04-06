// ─── Build OS — Core TypeScript Types ─────────────────────────────────────────
// Manually derived from migrations 001-013.
// Replace with `supabase gen types typescript` once connected to your project.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Organization, 'id'>>
      }
      users: {
        Row: AppUser
        Insert: Omit<AppUser, 'created_at' | 'updated_at'>
        Update: Partial<Omit<AppUser, 'id'>>
      }
      workspaces: {
        Row: Workspace
        Insert: Omit<Workspace, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Workspace, 'id'>>
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'actual_build_cost_usd'>
        Update: Partial<Omit<Project, 'id'>>
      }
      project_environments: {
        Row: ProjectEnvironment
        Insert: Omit<ProjectEnvironment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ProjectEnvironment, 'id'>>
      }
      project_settings: {
        Row: ProjectSettings
        Insert: Omit<ProjectSettings, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ProjectSettings, 'id'>>
      }
      questionnaires: {
        Row: Questionnaire
        Insert: Omit<Questionnaire, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Questionnaire, 'id'>>
      }
      answers: {
        Row: Answer
        Insert: Omit<Answer, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Answer, 'id'>>
      }
      blueprints: {
        Row: Blueprint
        Insert: Omit<Blueprint, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Blueprint, 'id'>>
      }
      blueprint_features: {
        Row: BlueprintFeature
        Insert: Omit<BlueprintFeature, 'id' | 'created_at'>
        Update: Partial<Omit<BlueprintFeature, 'id'>>
      }
      epics: {
        Row: Epic
        Insert: Omit<Epic, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Epic, 'id'>>
      }
      features: {
        Row: Feature
        Insert: Omit<Feature, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Feature, 'id'>>
      }
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'retry_count'>
        Update: Partial<Omit<Task, 'id'>>
      }
      documents: {
        Row: Document_
        Insert: Omit<Document_, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Document_, 'id'>>
      }
      integration_providers: {
        Row: IntegrationProvider
        Insert: Omit<IntegrationProvider, 'id' | 'created_at'>
        Update: Partial<Omit<IntegrationProvider, 'id'>>
      }
      cost_models: {
        Row: CostModel
        Insert: Omit<CostModel, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CostModel, 'id'>>
      }
      // ── ERT-P3 migrations 017-019 ─────────────────────────────────────
      project_files: {
        Row: ProjectFile
        Insert: Omit<ProjectFile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ProjectFile, 'id'>>
      }
      file_locks: {
        Row: FileLock
        Insert: Omit<FileLock, 'id' | 'acquired_at'>
        Update: Partial<Omit<FileLock, 'id'>>
      }
      generation_events: {
        Row: GenerationEvent
        Insert: Omit<GenerationEvent, 'id' | 'occurred_at'>
        Update: never
      }
    }
    Views: {
      credentials_safe_view: { Row: CredentialSafe }
    }
    Functions: {
      cleanup_expired_file_locks: { Args: Record<never, never>; Returns: number }
    }
    Enums: {}
  }
}

// ─── Row Types ────────────────────────────────────────────────────────────────
export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'enterprise'
  billing_email: string | null
  metadata: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface AppUser {
  id: string
  organization_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: 'owner' | 'admin' | 'member'
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string | null
  is_default: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProjectStatus =
  | 'draft' | 'blueprint' | 'planning' | 'in_progress'
  | 'in_qa' | 'ready_for_release' | 'live' | 'paused' | 'archived'

export type ProjectType = 'crm' | 'saas' | 'ai_app' | 'marketplace' | 'tool' | 'api' | 'other'

export interface Project {
  id: string
  workspace_id: string
  name: string
  slug: string
  description: string | null
  status: ProjectStatus
  tech_stack: Json
  project_type?: ProjectType
  complexity_score: number | null
  estimated_build_cost_usd: number | null
  actual_build_cost_usd: number
  budget_usd: number | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProjectEnvironment {
  id: string
  project_id: string
  name: 'development' | 'staging' | 'production'
  is_production: boolean
  variables: Json
  deployment_url: string | null
  created_at: string
  updated_at: string
}

export interface ProjectSettings {
  id: string
  project_id: string
  max_parallel_agents: number
  auto_dispatch: boolean
  require_qa_on_all_tasks: boolean
  cost_alert_threshold_usd: number | null
  preferred_ai_provider: 'anthropic' | 'openai' | null
  notification_webhook_url: string | null
  created_at: string
  updated_at: string
}

export interface QuestionDef {
  id: string
  text: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'tags'
  placeholder?: string
  options?: { value: string; label: string }[]
  required: boolean
}

export interface Questionnaire {
  id: string
  project_id: string
  version: number
  status: 'active' | 'completed' | 'superseded'
  questions: QuestionDef[]
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Answer {
  id: string
  questionnaire_id: string
  question_id: string
  answered_by: string
  value: Json
  created_at: string
  updated_at: string
}

export interface Blueprint {
  id: string
  project_id: string
  questionnaire_id: string
  version: number
  status: 'draft' | 'accepted' | 'superseded'
  summary: string | null
  goals: string[]
  non_goals: string[]
  user_personas: string[]
  feature_list: Json
  tech_stack_recommendation: Json
  risk_flags: Json
  generated_by_agent: string | null
  accepted_by: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface BlueprintFeature {
  id: string
  blueprint_id: string
  project_id: string
  title: string
  description: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  order_index: number
  created_at: string
}

export type EpicStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface Epic {
  id: string
  project_id: string
  title: string
  description: string | null
  status: EpicStatus
  order_index: number
  created_at: string
  updated_at: string
}

export interface Feature {
  id: string
  epic_id: string
  project_id: string
  title: string
  description: string | null
  acceptance_criteria: string[]
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'critical' | 'high' | 'medium' | 'low'
  order_index: number
  created_at: string
  updated_at: string
}

export type TaskStatus =
  | 'pending' | 'ready' | 'dispatched' | 'in_progress'
  | 'awaiting_review' | 'in_qa' | 'blocked' | 'failed' | 'completed' | 'cancelled'

export type AgentRole =
  | 'orchestrator' | 'architect' | 'product_analyst' | 'backend_engineer'
  | 'frontend_engineer' | 'automation_engineer' | 'integration_engineer'
  | 'qa_security_auditor' | 'documentation_engineer' | 'cost_analyst'
  | 'recommendation_analyst' | 'release_manager'

export interface Task {
  id: string
  feature_id: string
  project_id: string
  title: string
  description: string | null
  agent_role: AgentRole
  status: TaskStatus
  task_type: 'code' | 'schema' | 'document' | 'test' | 'review' | 'deploy' | 'design'
  priority: 'critical' | 'high' | 'medium' | 'low'
  context_payload: Json
  expected_output_schema: Json | null
  retry_count: number
  max_retries: number
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
  dispatched_at: string | null
  completed_at: string | null
  order_index: number
  created_at: string
  updated_at: string
  // Phase 7.9: execution lane split
  execution_lane?: 'fast' | 'heavy' | null
}

export interface Document_ {
  id: string
  project_id: string
  document_type: 'prd' | 'architecture' | 'adr' | 'data_model' | 'api_contract' | 'automation' | 'cost_model' | 'qa_report' | 'runbook' | 'other'
  title: string
  status: 'draft' | 'in_review' | 'accepted' | 'superseded' | 'deprecated'
  version: number
  content: string | null
  owner_agent_role: string | null
  superseded_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface IntegrationProvider {
  id: string
  name: string
  display_name: string
  category: string
  auth_type: string
  required_fields: string[]
  optional_fields: string[]
  health_check_url: string | null
  docs_url: string | null
  is_active: boolean
  created_at: string
}

export interface CredentialSafe {
  id: string
  workspace_id: string
  provider_id: string
  label: string
  encryption_key_ref: string
  is_active: boolean
  expires_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CostModel {
  id: string
  project_id: string
  total_spend_usd: number
  ai_usage_usd: number
  automation_usd: number
  infrastructure_usd: number
  saas_usd: number
  storage_usd: number
  projected_monthly_usd: number | null
  budget_usd: number | null
  last_calculated_at: string
  created_at: string
  updated_at: string
}

// ─── Derived / Composite Types ────────────────────────────────────────────────
export interface ProjectWithStats extends Project {
  total_tasks: number
  completed_tasks: number
  blueprint?: Blueprint | null
}

export interface EpicWithFeatures extends Epic {
  features: FeatureWithTasks[]
}

export interface FeatureWithTasks extends Feature {
  tasks: Task[]
}

export interface TasksByStatus {
  pending: Task[]
  ready: Task[]
  in_progress: Task[]
  completed: Task[]
  blocked: Task[]
  failed: Task[]
}

// ─── API Response Types ───────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T
  error: null
}
export interface ApiError {
  data: null
  error: string
}

export type ApiResult<T> = ApiResponse<T> | ApiError

// ─── Onboarding ───────────────────────────────────────────────────────────────
export interface OnboardingAnswers {
  what_building: string
  target_user: string
  core_outcome: string
  key_features: string
  integrations: string[]
}

// ─── ERT-P3: Project Files, File Locks, Generation Events (migrations 017-019) ─

export type GenerationStatus =
  | 'pending_generation'
  | 'generating'
  | 'files_written'
  | 'compile_failed'
  | 'commit_failed'  // WS2: files written locally but git push/verify failed — not delivered

export interface ProjectFile {
  id: string
  project_id: string
  file_path: string
  content: string
  content_hash: string
  previous_content: string | null
  encoding: string
  language: string | null
  updated_at: string
  updated_by_task: string | null
  created_at: string
  patch_version: number
}

export interface FileLock {
  id: string
  project_id: string
  file_path: string
  task_id: string
  acquired_at: string
  expires_at: string
}

export interface GenerationEvent {
  id: string
  project_id: string
  task_id: string
  agent_output_id: string
  status: GenerationStatus
  files_written: string[]
  errors: string[]
  occurred_at: string
}

// Extended AgentOutput (adds ERT-P3 generation tracking fields)
export interface AgentOutputGeneration {
  generation_status: GenerationStatus | null
  generated_files: string[]
  generation_errors: string[]
}
