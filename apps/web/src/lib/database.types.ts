export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_outputs: {
        Row: {
          agent_role: string
          content: Json
          created_at: string
          generated_files: string[] | null
          generation_errors: string[] | null
          generation_status: string | null
          id: string
          is_valid: boolean
          output_type: string
          project_id: string
          raw_text: string | null
          task_id: string
          task_run_id: string
          validation_errors: Json | null
        }
        Insert: {
          agent_role: string
          content: Json
          created_at?: string
          generated_files?: string[] | null
          generation_errors?: string[] | null
          generation_status?: string | null
          id?: string
          is_valid?: boolean
          output_type: string
          project_id: string
          raw_text?: string | null
          task_id: string
          task_run_id: string
          validation_errors?: Json | null
        }
        Update: {
          agent_role?: string
          content?: Json
          created_at?: string
          generated_files?: string[] | null
          generation_errors?: string[] | null
          generation_status?: string | null
          id?: string
          is_valid?: boolean
          output_type?: string
          project_id?: string
          raw_text?: string | null
          task_id?: string
          task_run_id?: string
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_outputs_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outputs_run_fk"
            columns: ["task_run_id"]
            isOneToOne: false
            referencedRelation: "task_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outputs_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answered_by: string
          created_at: string
          id: string
          question_id: string
          questionnaire_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          answered_by: string
          created_at?: string
          id?: string
          question_id: string
          questionnaire_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          answered_by?: string
          created_at?: string
          id?: string
          question_id?: string
          questionnaire_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "answers_q_fk"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_user_fk"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_contracts: {
        Row: {
          created_at: string
          id: string
          project_id: string
          service_name: string
          spec_content: Json
          spec_format: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          service_name: string
          spec_content: Json
          spec_format?: string
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          service_name?: string
          spec_content?: Json
          spec_format?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_contracts_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      architecture_decisions: {
        Row: {
          consequences: string | null
          context: string
          created_at: string
          created_by: string
          decision: string
          id: string
          number: number
          project_id: string
          status: string
          superseded_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          consequences?: string | null
          context: string
          created_at?: string
          created_by: string
          decision: string
          id?: string
          number: number
          project_id: string
          status?: string
          superseded_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          consequences?: string | null
          context?: string
          created_at?: string
          created_by?: string
          decision?: string
          id?: string
          number?: number
          project_id?: string
          status?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "architecture_decisions_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "architecture_decisions_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "architecture_decisions_super_fk"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "architecture_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          artifact_type: string
          checksum: string | null
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          project_id: string
          size_bytes: number | null
          storage_path: string
          task_id: string | null
        }
        Insert: {
          artifact_type: string
          checksum?: string | null
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          project_id: string
          size_bytes?: number | null
          storage_path: string
          task_id?: string | null
        }
        Update: {
          artifact_type?: string
          checksum?: string | null
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_type: string
          after_state: Json | null
          before_state: Json | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          organization_id: string
          project_id: string | null
          recorded_at: string
          resource_id: string | null
          resource_type: string
          trace_id: string
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_type: string
          after_state?: Json | null
          before_state?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id: string
          project_id?: string | null
          recorded_at?: string
          resource_id?: string | null
          resource_type: string
          trace_id?: string
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_type?: string
          after_state?: Json | null
          before_state?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id?: string
          project_id?: string | null
          recorded_at?: string
          resource_id?: string | null
          resource_type?: string
          trace_id?: string
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "al_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_reason_codes: {
        Row: {
          category: string
          code: string
          created_at: string | null
          description: string
          label: string
          operator_guidance: string | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          description: string
          label: string
          operator_guidance?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          description?: string
          label?: string
          operator_guidance?: string | null
        }
        Relationships: []
      }
      blockers: {
        Row: {
          assigned_to: string | null
          blocker_type: string
          created_at: string
          description: string
          id: string
          project_id: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          status: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          blocker_type: string
          created_at?: string
          description: string
          id?: string
          project_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          blocker_type?: string
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blockers_assignee_fk"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_features: {
        Row: {
          blueprint_id: string
          created_at: string
          description: string | null
          id: string
          order_index: number
          priority: string
          project_id: string
          title: string
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          priority?: string
          project_id: string
          title: string
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          priority?: string
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bf_blueprint_fk"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bf_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_stack_recommendations: {
        Row: {
          blueprint_id: string
          classification: string
          created_at: string
          id: string
          layer: string
          order_index: number
          project_id: string
          reasoning: string | null
          tool: string
        }
        Insert: {
          blueprint_id: string
          classification?: string
          created_at?: string
          id?: string
          layer: string
          order_index?: number
          project_id: string
          reasoning?: string | null
          tool: string
        }
        Update: {
          blueprint_id?: string
          classification?: string
          created_at?: string
          id?: string
          layer?: string
          order_index?: number
          project_id?: string
          reasoning?: string | null
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "bsr_blueprint_fk"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bsr_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprints: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          feature_list: Json
          generated_by_agent: string | null
          goals: Json
          id: string
          non_goals: Json
          project_id: string
          questionnaire_id: string
          risk_flags: Json
          status: string
          summary: string | null
          tech_stack_recommendation: Json
          updated_at: string
          user_personas: Json
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          feature_list?: Json
          generated_by_agent?: string | null
          goals?: Json
          id?: string
          non_goals?: Json
          project_id: string
          questionnaire_id: string
          risk_flags?: Json
          status?: string
          summary?: string | null
          tech_stack_recommendation?: Json
          updated_at?: string
          user_personas?: Json
          version?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          feature_list?: Json
          generated_by_agent?: string | null
          goals?: Json
          id?: string
          non_goals?: Json
          project_id?: string
          questionnaire_id?: string
          risk_flags?: Json
          status?: string
          summary?: string | null
          tech_stack_recommendation?: Json
          updated_at?: string
          user_personas?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_acceptor_fk"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprints_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprints_q_fk"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_records: {
        Row: {
          accuracy: number | null
          cost_usd: number | null
          created_at: string
          evaluated_at: string
          id: number
          model: string
          routing_profile_id: string | null
          sample_size: number
        }
        Insert: {
          accuracy?: number | null
          cost_usd?: number | null
          created_at?: string
          evaluated_at?: string
          id?: number
          model: string
          routing_profile_id?: string | null
          sample_size?: number
        }
        Update: {
          accuracy?: number | null
          cost_usd?: number | null
          created_at?: string
          evaluated_at?: string
          id?: number
          model?: string
          routing_profile_id?: string | null
          sample_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "calibration_records_routing_profile_id_fkey"
            columns: ["routing_profile_id"]
            isOneToOne: false
            referencedRelation: "routing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_estimates: {
        Row: {
          actual_usd: number | null
          confidence_level: string
          created_at: string
          estimate_type: string
          estimated_usd: number
          estimation_basis: Json
          id: string
          project_id: string
          task_id: string | null
          variance_pct: number | null
        }
        Insert: {
          actual_usd?: number | null
          confidence_level?: string
          created_at?: string
          estimate_type: string
          estimated_usd: number
          estimation_basis?: Json
          id?: string
          project_id: string
          task_id?: string | null
          variance_pct?: number | null
        }
        Update: {
          actual_usd?: number | null
          confidence_level?: string
          created_at?: string
          estimate_type?: string
          estimated_usd?: number
          estimation_basis?: Json
          id?: string
          project_id?: string
          task_id?: string | null
          variance_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_estimates_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_estimates_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_events: {
        Row: {
          category: string
          id: string
          metadata: Json
          model: string | null
          project_id: string
          provider: string
          recorded_at: string
          task_run_id: string | null
          total_cost_usd: number
          unit_cost_usd: number
          unit_label: string
          units: number
        }
        Insert: {
          category: string
          id?: string
          metadata?: Json
          model?: string | null
          project_id: string
          provider: string
          recorded_at?: string
          task_run_id?: string | null
          total_cost_usd?: number
          unit_cost_usd: number
          unit_label: string
          units: number
        }
        Update: {
          category?: string
          id?: string
          metadata?: Json
          model?: string | null
          project_id?: string
          provider?: string
          recorded_at?: string
          task_run_id?: string | null
          total_cost_usd?: number
          unit_cost_usd?: number
          unit_label?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_events_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_events_run_fk"
            columns: ["task_run_id"]
            isOneToOne: false
            referencedRelation: "task_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_models: {
        Row: {
          ai_usage_usd: number
          automation_usd: number
          budget_usd: number | null
          created_at: string
          id: string
          infrastructure_usd: number
          last_calculated_at: string
          project_id: string
          projected_monthly_usd: number | null
          saas_usd: number
          storage_usd: number
          total_spend_usd: number
          updated_at: string
        }
        Insert: {
          ai_usage_usd?: number
          automation_usd?: number
          budget_usd?: number | null
          created_at?: string
          id?: string
          infrastructure_usd?: number
          last_calculated_at?: string
          project_id: string
          projected_monthly_usd?: number | null
          saas_usd?: number
          storage_usd?: number
          total_spend_usd?: number
          updated_at?: string
        }
        Update: {
          ai_usage_usd?: number
          automation_usd?: number
          budget_usd?: number | null
          created_at?: string
          id?: string
          infrastructure_usd?: number
          last_calculated_at?: string
          project_id?: string
          projected_monthly_usd?: number | null
          saas_usd?: number
          storage_usd?: number
          total_spend_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_models_project_fk"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_policies: {
        Row: {
          agent_role: string | null
          created_at: string
          current_day_spent_usd: number
          current_run_spent_usd: number
          daily_budget_usd: number | null
          description: string | null
          enabled: boolean
          enforcement_action: string
          id: string
          last_reset_at: string | null
          name: string
          per_task_ceiling_usd: number | null
          project_id: string | null
          run_budget_usd: number | null
          updated_at: string
        }
        Insert: {
          agent_role?: string | null
          created_at?: string
          current_day_spent_usd?: number
          current_run_spent_usd?: number
          daily_budget_usd?: number | null
          description?: string | null
          enabled?: boolean
          enforcement_action?: string
          id?: string
          last_reset_at?: string | null
          name: string
          per_task_ceiling_usd?: number | null
          project_id?: string | null
          run_budget_usd?: number | null
          updated_at?: string
        }
        Update: {
          agent_role?: string | null
          created_at?: string
          current_day_spent_usd?: number
          current_run_spent_usd?: number
          daily_budget_usd?: number | null
          description?: string | null
          enabled?: boolean
          enforcement_action?: string
          id?: string
          last_reset_at?: string | null
          name?: string
          per_task_ceiling_usd?: number | null
          project_id?: string | null
          run_budget_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_policies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          created_at: string
          created_by: string
          encrypted_values: string
          encryption_key_ref: string
          expires_at: string | null
          id: string
          is_active: boolean
          label: string
          provider_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          encrypted_values: string
          encryption_key_ref: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          provider_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          encrypted_values?: string
          encryption_key_ref?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          provider_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credentials_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_provider_fk"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_workspace_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cutover_flags: {
        Row: {
          authorized_at: string | null
          authorized_by: string | null
          created_at: string
          cutover_authorized: boolean
          domain: string
          id: string
          ledger_complete: boolean | null
          notes: string | null
          promotion_criteria: Json | null
          qa_tests_passed: boolean | null
          reconciliation_clean: boolean | null
          shadow_match_rate: number | null
          updated_at: string
        }
        Insert: {
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          cutover_authorized?: boolean
          domain: string
          id?: string
          ledger_complete?: boolean | null
          notes?: string | null
          promotion_criteria?: Json | null
          qa_tests_passed?: boolean | null
          reconciliation_clean?: boolean | null
          shadow_match_rate?: number | null
          updated_at?: string
        }
        Update: {
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          cutover_authorized?: boolean
          domain?: string
          id?: string
          ledger_complete?: boolean | null
          notes?: string | null
          promotion_criteria?: Json | null
          qa_tests_passed?: boolean | null
          reconciliation_clean?: boolean | null
          shadow_match_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      dead_letter_queue: {
        Row: {
          correlation_id: string | null
          created_at: string
          failure_reason: string | null
          id: string
          payload: Json
          task_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          payload?: Json
          task_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          payload?: Json
          task_id?: string | null
        }
        Relationships: []
      }
      delivery_checkpoints: {
        Row: {
          blocked_reason_code: string | null
          created_at: string | null
          from_state: string | null
          gate_snapshot: Json | null
          id: string
          metadata: Json | null
          task_id: string
          task_run_id: string | null
          to_state: string
          transition_reason: string | null
          triggered_by: string
        }
        Insert: {
          blocked_reason_code?: string | null
          created_at?: string | null
          from_state?: string | null
          gate_snapshot?: Json | null
          id?: string
          metadata?: Json | null
          task_id: string
          task_run_id?: string | null
          to_state: string
          transition_reason?: string | null
          triggered_by: string
        }
        Update: {
          blocked_reason_code?: string | null
          created_at?: string | null
          from_state?: string | null
          gate_snapshot?: Json | null
          id?: string
          metadata?: Json | null
          task_id?: string
          task_run_id?: string | null
          to_state?: string
          transition_reason?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_checkpoints_blocked_reason_code_fkey"
            columns: ["blocked_reason_code"]
            isOneToOne: false
            referencedRelation: "blocked_reason_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "delivery_checkpoints_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_checkpoints_task_run_id_fkey"
            columns: ["task_run_id"]
            isOneToOne: false
            referencedRelation: "task_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_targets: {
        Row: {
          created_at: string
          environment_id: string
          health_url: string | null
          id: string
          last_deployed_at: string | null
          last_deployment_id: string | null
          project_id: string
          provider: string
          status: string
          target_config: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment_id: string
          health_url?: string | null
          id?: string
          last_deployed_at?: string | null
          last_deployment_id?: string | null
          project_id: string
          provider: string
          status?: string
          target_config?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment_id?: string
          health_url?: string | null
          id?: string
          last_deployed_at?: string | null
          last_deployment_id?: string | null
          project_id?: string
          provider?: string
          status?: string
          target_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployment_targets_env_fk"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "project_environments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_targets_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string
          document_type: string
          id: string
          owner_agent_role: string | null
          project_id: string
          status: string
          superseded_by: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by: string
          document_type: string
          id?: string
          owner_agent_role?: string | null
          project_id: string
          status?: string
          superseded_by?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string
          document_type?: string
          id?: string
          owner_agent_role?: string | null
          project_id?: string
          status?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_super_fk"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string
          dns_status: string
          domain: string
          id: string
          is_primary: boolean
          project_id: string
          provider: string | null
          ssl_status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          dns_status?: string
          domain: string
          id?: string
          is_primary?: boolean
          project_id: string
          provider?: string | null
          ssl_status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          dns_status?: string
          domain?: string
          id?: string
          is_primary?: boolean
          project_id?: string
          provider?: string | null
          ssl_status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      epics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number
          priority: string
          project_id: string
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          priority?: string
          project_id: string
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          priority?: string
          project_id?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "epics_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criteria: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: number
          name: string
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: number
          name: string
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          weight?: number
        }
        Relationships: []
      }
      evaluation_scores: {
        Row: {
          classification: string
          created_at: string
          criteria_id: number | null
          evaluator_id: string | null
          id: number
          normalized_score: number | null
          notes: string | null
          score: number
          task_id: string
        }
        Insert: {
          classification?: string
          created_at?: string
          criteria_id?: number | null
          evaluator_id?: string | null
          id?: number
          normalized_score?: number | null
          notes?: string | null
          score: number
          task_id: string
        }
        Update: {
          classification?: string
          created_at?: string
          criteria_id?: number | null
          evaluator_id?: string | null
          id?: number
          normalized_score?: number | null
          notes?: string | null
          score?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_scores_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          acceptance_criteria: Json
          created_at: string
          description: string | null
          epic_id: string
          id: string
          order_index: number
          priority: string
          project_id: string
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_criteria?: Json
          created_at?: string
          description?: string | null
          epic_id: string
          id?: string
          order_index?: number
          priority?: string
          project_id: string
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: Json
          created_at?: string
          description?: string | null
          epic_id?: string
          id?: string
          order_index?: number
          priority?: string
          project_id?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "features_epic_fk"
            columns: ["epic_id"]
            isOneToOne: false
            referencedRelation: "epics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "features_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      file_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          file_path: string
          id: string
          project_id: string
          task_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at?: string
          file_path: string
          id?: string
          project_id: string
          task_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          file_path?: string
          id?: string
          project_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fl_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fl_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_policies: {
        Row: {
          created_at: string | null
          delivery_type: Database["public"]["Enums"]["task_delivery_type"]
          description: string | null
          id: string
          optional_gates: string[] | null
          required_gates: string[]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_type: Database["public"]["Enums"]["task_delivery_type"]
          description?: string | null
          id?: string
          optional_gates?: string[] | null
          required_gates: string[]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_type?: Database["public"]["Enums"]["task_delivery_type"]
          description?: string | null
          id?: string
          optional_gates?: string[] | null
          required_gates?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      generation_events: {
        Row: {
          agent_output_id: string
          errors: string[]
          files_written: string[]
          id: string
          occurred_at: string
          project_id: string
          status: string
          task_id: string
        }
        Insert: {
          agent_output_id: string
          errors?: string[]
          files_written?: string[]
          id?: string
          occurred_at?: string
          project_id: string
          status: string
          task_id: string
        }
        Update: {
          agent_output_id?: string
          errors?: string[]
          files_written?: string[]
          id?: string
          occurred_at?: string
          project_id?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ge_output_fk"
            columns: ["agent_output_id"]
            isOneToOne: false
            referencedRelation: "agent_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ge_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ge_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          caller_id: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          operation: string
          project_id: string
          request_hash: string
          resource_id: string | null
          response_body: Json | null
          status: string
        }
        Insert: {
          caller_id: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          operation: string
          project_id: string
          request_hash: string
          resource_id?: string | null
          response_body?: Json | null
          status?: string
        }
        Update: {
          caller_id?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          project_id?: string
          request_hash?: string
          resource_id?: string | null
          response_body?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ik_proj_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_environment_credentials: {
        Row: {
          created_at: string
          credential_id: string
          environment: string
          id: string
          integration_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          environment: string
          id?: string
          integration_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          environment?: string
          id?: string
          integration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iec_cred_fk"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iec_cred_fk"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials_safe_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iec_int_fk"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "project_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          auth_type: string
          category: string
          created_at: string
          display_name: string
          docs_url: string | null
          health_check_url: string | null
          id: string
          is_active: boolean
          name: string
          optional_fields: Json
          required_fields: Json
        }
        Insert: {
          auth_type: string
          category: string
          created_at?: string
          display_name: string
          docs_url?: string | null
          health_check_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          optional_fields?: Json
          required_fields?: Json
        }
        Update: {
          auth_type?: string
          category?: string
          created_at?: string
          display_name?: string
          docs_url?: string | null
          health_check_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          optional_fields?: Json
          required_fields?: Json
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          completed_at: string | null
          correlation_id: string
          created_at: string
          error: string | null
          feature_id: string | null
          id: string
          payload: Json
          project_id: string | null
          retry_count: number
          started_at: string | null
          status: string
          task_id: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error?: string | null
          feature_id?: string | null
          id?: string
          payload?: Json
          project_id?: string | null
          retry_count?: number
          started_at?: string | null
          status?: string
          task_id: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error?: string | null
          feature_id?: string | null
          id?: string
          payload?: Json
          project_id?: string | null
          retry_count?: number
          started_at?: string | null
          status?: string
          task_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      jsonb_output_schemas: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          json_schema: Json
          output_type: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          json_schema: Json
          output_type: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          json_schema?: Json
          output_type?: string
          version?: number
        }
        Relationships: []
      }
      migration_ledger: {
        Row: {
          domain: string
          evidence: Json | null
          from_state: string | null
          id: string
          performed_by: string
          policy_violations: string[] | null
          recorded_at: string
          reversible: boolean
          rollback_steps: string | null
          step_name: string
          step_type: string
          to_state: string | null
        }
        Insert: {
          domain: string
          evidence?: Json | null
          from_state?: string | null
          id?: string
          performed_by?: string
          policy_violations?: string[] | null
          recorded_at?: string
          reversible?: boolean
          rollback_steps?: string | null
          step_name: string
          step_type: string
          to_state?: string | null
        }
        Update: {
          domain?: string
          evidence?: Json | null
          from_state?: string | null
          id?: string
          performed_by?: string
          policy_violations?: string[] | null
          recorded_at?: string
          reversible?: boolean
          rollback_steps?: string | null
          step_name?: string
          step_type?: string
          to_state?: string | null
        }
        Relationships: []
      }
      orchestration_runs: {
        Row: {
          active_after: number
          active_before: number
          completed_at: string | null
          created_at: string
          guardrail_hit: boolean
          guardrail_reason: string | null
          id: string
          project_id: string
          queue_depth: number
          tasks_dispatched: Json
          tasks_unlocked: Json
          tick_number: number
          triggered_by: string
        }
        Insert: {
          active_after?: number
          active_before?: number
          completed_at?: string | null
          created_at?: string
          guardrail_hit?: boolean
          guardrail_reason?: string | null
          id?: string
          project_id: string
          queue_depth?: number
          tasks_dispatched?: Json
          tasks_unlocked?: Json
          tick_number?: number
          triggered_by?: string
        }
        Update: {
          active_after?: number
          active_before?: number
          completed_at?: string | null
          created_at?: string
          guardrail_hit?: boolean
          guardrail_reason?: string | null
          id?: string
          project_id?: string
          queue_depth?: number
          tasks_dispatched?: Json
          tasks_unlocked?: Json
          tick_number?: number
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_runs_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          created_at: string
          deleted_at: string | null
          id: string
          metadata: Json
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          name: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      prevention_rules: {
        Row: {
          created_at: string
          description: string
          enforcement_type: string
          example: string
          id: string
          owner_domain: string
          rule_code: string
          source_bug_id: string
          status: string
          title: string
          trigger_condition: string
        }
        Insert: {
          created_at?: string
          description: string
          enforcement_type: string
          example: string
          id?: string
          owner_domain: string
          rule_code: string
          source_bug_id: string
          status?: string
          title: string
          trigger_condition: string
        }
        Update: {
          created_at?: string
          description?: string
          enforcement_type?: string
          example?: string
          id?: string
          owner_domain?: string
          rule_code?: string
          source_bug_id?: string
          status?: string
          title?: string
          trigger_condition?: string
        }
        Relationships: []
      }
      project_environments: {
        Row: {
          created_at: string
          deployment_url: string | null
          id: string
          is_production: boolean
          name: string
          project_id: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          deployment_url?: string | null
          id?: string
          is_production?: boolean
          name: string
          project_id: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          deployment_url?: string | null
          id?: string
          is_production?: boolean
          name?: string
          project_id?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_environments_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          content: string
          content_hash: string
          created_at: string
          encoding: string
          file_path: string
          id: string
          language: string | null
          patch_version: number
          previous_content: string | null
          project_id: string
          updated_at: string
          updated_by_task: string | null
        }
        Insert: {
          content?: string
          content_hash?: string
          created_at?: string
          encoding?: string
          file_path: string
          id?: string
          language?: string | null
          patch_version?: number
          previous_content?: string | null
          project_id: string
          updated_at?: string
          updated_by_task?: string | null
        }
        Update: {
          content?: string
          content_hash?: string
          created_at?: string
          encoding?: string
          file_path?: string
          id?: string
          language?: string | null
          patch_version?: number
          previous_content?: string | null
          project_id?: string
          updated_at?: string
          updated_by_task?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pf_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_task_fk"
            columns: ["updated_by_task"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_integrations: {
        Row: {
          created_at: string
          created_by: string
          credential_id: string
          environment_map: Json
          id: string
          last_error: string | null
          last_health_check_at: string | null
          project_id: string
          provider_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          credential_id: string
          environment_map?: Json
          id?: string
          last_error?: string | null
          last_health_check_at?: string | null
          project_id: string
          provider_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          credential_id?: string
          environment_map?: Json
          id?: string
          last_error?: string | null
          last_health_check_at?: string | null
          project_id?: string
          provider_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_integrations_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_integrations_cred_fk"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_integrations_cred_fk"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials_safe_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_integrations_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_integrations_provider_fk"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_settings: {
        Row: {
          auto_dispatch: boolean
          cost_alert_threshold_usd: number | null
          created_at: string
          id: string
          max_parallel_agents: number
          notification_webhook_url: string | null
          orchestration_mode: string
          preferred_ai_provider: string | null
          project_id: string
          require_qa_on_all_tasks: boolean
          safe_stop: boolean
          updated_at: string
        }
        Insert: {
          auto_dispatch?: boolean
          cost_alert_threshold_usd?: number | null
          created_at?: string
          id?: string
          max_parallel_agents?: number
          notification_webhook_url?: string | null
          orchestration_mode?: string
          preferred_ai_provider?: string | null
          project_id: string
          require_qa_on_all_tasks?: boolean
          safe_stop?: boolean
          updated_at?: string
        }
        Update: {
          auto_dispatch?: boolean
          cost_alert_threshold_usd?: number | null
          created_at?: string
          id?: string
          max_parallel_agents?: number
          notification_webhook_url?: string | null
          orchestration_mode?: string
          preferred_ai_provider?: string | null
          project_id?: string
          require_qa_on_all_tasks?: boolean
          safe_stop?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_settings_project_fk"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tech_stack_items: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          order_index: number
          project_id: string
          version: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          order_index?: number
          project_id: string
          version?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          project_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pti_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_build_cost_usd: number
          budget_usd: number | null
          complexity_score: number | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          estimated_build_cost_usd: number | null
          id: string
          name: string
          project_type: string
          slug: string
          start_date: string | null
          status: string
          target_date: string | null
          tech_stack: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_build_cost_usd?: number
          budget_usd?: number | null
          complexity_score?: number | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          estimated_build_cost_usd?: number | null
          id?: string
          name: string
          project_type?: string
          slug: string
          start_date?: string | null
          status?: string
          target_date?: string | null
          tech_stack?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_build_cost_usd?: number
          budget_usd?: number | null
          complexity_score?: number | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          estimated_build_cost_usd?: number | null
          id?: string
          name?: string
          project_type?: string
          slug?: string
          start_date?: string | null
          status?: string
          target_date?: string | null
          tech_stack?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_connections: {
        Row: {
          access_token: string
          connected_at: string
          expires_at: string | null
          id: string
          provider: string
          provider_user_id: string | null
          provider_user_login: string | null
          refresh_token: string | null
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          expires_at?: string | null
          id?: string
          provider: string
          provider_user_id?: string | null
          provider_user_login?: string | null
          refresh_token?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          provider_user_id?: string | null
          provider_user_login?: string | null
          refresh_token?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_verdicts: {
        Row: {
          agent_output_id: string
          created_at: string
          id: string
          issues: Json
          project_id: string
          reviewed_by_agent: string
          score: number | null
          security_flags: Json
          suggestions: Json
          task_id: string
          verdict: string
        }
        Insert: {
          agent_output_id: string
          created_at?: string
          id?: string
          issues?: Json
          project_id: string
          reviewed_by_agent?: string
          score?: number | null
          security_flags?: Json
          suggestions?: Json
          task_id: string
          verdict: string
        }
        Update: {
          agent_output_id?: string
          created_at?: string
          id?: string
          issues?: Json
          project_id?: string
          reviewed_by_agent?: string
          score?: number | null
          security_flags?: Json
          suggestions?: Json
          task_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_verdicts_output_fk"
            columns: ["agent_output_id"]
            isOneToOne: false
            referencedRelation: "agent_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_verdicts_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_verdicts_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaires: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          project_id: string
          questions: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          project_id: string
          questions?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          project_id?: string
          questions?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "questionnaires_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_items: {
        Row: {
          category: string
          classification: string
          created_at: string
          estimated_cost_impact_usd: number | null
          id: string
          project_id: string
          reasoning: string
          report_id: string
          signal: string | null
          tool: string
        }
        Insert: {
          category: string
          classification: string
          created_at?: string
          estimated_cost_impact_usd?: number | null
          id?: string
          project_id: string
          reasoning: string
          report_id: string
          signal?: string | null
          tool: string
        }
        Update: {
          category?: string
          classification?: string
          created_at?: string
          estimated_cost_impact_usd?: number | null
          id?: string
          project_id?: string
          reasoning?: string
          report_id?: string
          signal?: string | null
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "ri_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ri_report_fk"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "recommendation_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_reports: {
        Row: {
          created_at: string
          id: string
          items: Json
          maturity_signals: Json
          project_id: string
          recommended_count: number
          required_now_count: number
          status: string
          triggered_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          maturity_signals?: Json
          project_id: string
          recommended_count?: number
          required_now_count?: number
          status?: string
          triggered_by: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          maturity_signals?: Json
          project_id?: string
          recommended_count?: number
          required_now_count?: number
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_reports_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_events: {
        Row: {
          check_type: string
          checked_at: string
          domain: string
          id: string
          mismatch_detail: Json | null
          redis_value: Json | null
          repair_action: string | null
          repair_applied: boolean
          status: string
          supabase_value: Json | null
          temporal_value: Json | null
        }
        Insert: {
          check_type: string
          checked_at?: string
          domain: string
          id?: string
          mismatch_detail?: Json | null
          redis_value?: Json | null
          repair_action?: string | null
          repair_applied?: boolean
          status: string
          supabase_value?: Json | null
          temporal_value?: Json | null
        }
        Update: {
          check_type?: string
          checked_at?: string
          domain?: string
          id?: string
          mismatch_detail?: Json | null
          redis_value?: Json | null
          repair_action?: string | null
          repair_applied?: boolean
          status?: string
          supabase_value?: Json | null
          temporal_value?: Json | null
        }
        Relationships: []
      }
      release_readiness: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_tasks: number
          created_at: string
          deployed_at: string | null
          deployment_url: string | null
          failed_tasks: number
          id: string
          notes: string | null
          project_id: string
          qa_pass_rate: number | null
          release_version: string
          status: string
          total_tasks: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_tasks?: number
          created_at?: string
          deployed_at?: string | null
          deployment_url?: string | null
          failed_tasks?: number
          id?: string
          notes?: string | null
          project_id: string
          qa_pass_rate?: number | null
          release_version: string
          status?: string
          total_tasks?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_tasks?: number
          created_at?: string
          deployed_at?: string | null
          deployment_url?: string | null
          failed_tasks?: number
          id?: string
          notes?: string | null
          project_id?: string
          qa_pass_rate?: number | null
          release_version?: string
          status?: string
          total_tasks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_readiness_approver_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_readiness_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_locks: {
        Row: {
          acquired_at: string
          created_at: string
          expires_at: string
          id: string
          lock_type: string
          locked_by_agent: string | null
          locked_by_task_run: string | null
          locked_by_user: string | null
          metadata: Json
          resource_id: string
          resource_type: string
        }
        Insert: {
          acquired_at?: string
          created_at?: string
          expires_at?: string
          id?: string
          lock_type?: string
          locked_by_agent?: string | null
          locked_by_task_run?: string | null
          locked_by_user?: string | null
          metadata?: Json
          resource_id: string
          resource_type: string
        }
        Update: {
          acquired_at?: string
          created_at?: string
          expires_at?: string
          id?: string
          lock_type?: string
          locked_by_agent?: string | null
          locked_by_task_run?: string | null
          locked_by_user?: string | null
          metadata?: Json
          resource_id?: string
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rl_resource_fk"
            columns: ["locked_by_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rl_task_run_fk"
            columns: ["locked_by_task_run"]
            isOneToOne: false
            referencedRelation: "task_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      retry_logs: {
        Row: {
          attempt_number: number
          created_at: string
          delay_ms: number
          id: string
          next_retry_at: string | null
          project_id: string
          result: string | null
          result_detail: string | null
          retry_type: string
          task_id: string
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          delay_ms?: number
          id?: string
          next_retry_at?: string | null
          project_id: string
          result?: string | null
          result_detail?: string | null
          retry_type: string
          task_id: string
          triggered_at?: string
          triggered_by?: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          delay_ms?: number
          id?: string
          next_retry_at?: string | null
          project_id?: string
          result?: string | null
          result_detail?: string | null
          retry_type?: string
          task_id?: string
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "retry_logs_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retry_logs_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      retry_policies: {
        Row: {
          backoff_strategy: string
          created_at: string
          description: string | null
          enabled: boolean
          escalation_action: string | null
          escalation_after_retries: number | null
          id: string
          initial_delay_seconds: number
          match_complexity: string | null
          match_risk: string | null
          max_delay_seconds: number
          max_retries: number
          name: string
          priority: number
        }
        Insert: {
          backoff_strategy?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          escalation_action?: string | null
          escalation_after_retries?: number | null
          id?: string
          initial_delay_seconds?: number
          match_complexity?: string | null
          match_risk?: string | null
          max_delay_seconds?: number
          max_retries?: number
          name: string
          priority?: number
        }
        Update: {
          backoff_strategy?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          escalation_action?: string | null
          escalation_after_retries?: number | null
          id?: string
          initial_delay_seconds?: number
          match_complexity?: string | null
          match_risk?: string | null
          max_delay_seconds?: number
          max_retries?: number
          name?: string
          priority?: number
        }
        Relationships: []
      }
      routing_decisions: {
        Row: {
          complexity_tier: string
          cost_ceiling_usd: number | null
          cost_tier: string
          decided_at: string
          decision_ms: number | null
          fallback_used: boolean
          id: string
          model: string
          project_id: string | null
          rationale: string | null
          risk_tier: string
          rule_id: string | null
          rule_name: string | null
          runtime: string
          task_id: string
          task_run_id: string | null
        }
        Insert: {
          complexity_tier?: string
          cost_ceiling_usd?: number | null
          cost_tier?: string
          decided_at?: string
          decision_ms?: number | null
          fallback_used?: boolean
          id?: string
          model?: string
          project_id?: string | null
          rationale?: string | null
          risk_tier?: string
          rule_id?: string | null
          rule_name?: string | null
          runtime?: string
          task_id: string
          task_run_id?: string | null
        }
        Update: {
          complexity_tier?: string
          cost_ceiling_usd?: number | null
          cost_tier?: string
          decided_at?: string
          decision_ms?: number | null
          fallback_used?: boolean
          id?: string
          model?: string
          project_id?: string | null
          rationale?: string | null
          risk_tier?: string
          rule_id?: string | null
          rule_name?: string | null
          runtime?: string
          task_id?: string
          task_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_decisions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "routing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_decisions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_profiles: {
        Row: {
          classification_ms: number | null
          classifier_version: string | null
          complexity_tier: string
          cost_tier: string
          created_at: string
          id: string
          model_hint: string
          project_id: string | null
          raw_signals: Json | null
          risk_tier: string
          runtime_hint: string
          task_id: string
          task_run_id: string | null
        }
        Insert: {
          classification_ms?: number | null
          classifier_version?: string | null
          complexity_tier?: string
          cost_tier?: string
          created_at?: string
          id?: string
          model_hint?: string
          project_id?: string | null
          raw_signals?: Json | null
          risk_tier?: string
          runtime_hint?: string
          task_id: string
          task_run_id?: string | null
        }
        Update: {
          classification_ms?: number | null
          classifier_version?: string | null
          complexity_tier?: string
          cost_tier?: string
          created_at?: string
          id?: string
          model_hint?: string
          project_id?: string | null
          raw_signals?: Json | null
          risk_tier?: string
          runtime_hint?: string
          task_id?: string
          task_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_profiles_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_rules: {
        Row: {
          cost_ceiling_usd: number | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          match_agent_role: string | null
          match_complexity: string | null
          match_cost: string | null
          match_risk: string | null
          model_override: string | null
          name: string
          priority: number
          target_runtime: string
          updated_at: string
        }
        Insert: {
          cost_ceiling_usd?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          match_agent_role?: string | null
          match_complexity?: string | null
          match_cost?: string | null
          match_risk?: string | null
          model_override?: string | null
          name: string
          priority?: number
          target_runtime?: string
          updated_at?: string
        }
        Update: {
          cost_ceiling_usd?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          match_agent_role?: string | null
          match_complexity?: string | null
          match_cost?: string | null
          match_risk?: string | null
          model_override?: string | null
          name?: string
          priority?: number
          target_runtime?: string
          updated_at?: string
        }
        Relationships: []
      }
      schema_registry: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          description: string
          id: string
          project_id: string
          sql_down: string | null
          sql_up: string
          status: string
          version: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          description: string
          id?: string
          project_id: string
          sql_down?: string | null
          sql_up: string
          status?: string
          version: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          sql_down?: string | null
          sql_up?: string
          status?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_registry_applier_fk"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schema_registry_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shadow_results: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string | null
          output_summary: string | null
          output_type: string | null
          raw_payload: Json | null
          source: string
          success: boolean
          task_id: string
          task_run_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          output_summary?: string | null
          output_type?: string | null
          raw_payload?: Json | null
          source?: string
          success: boolean
          task_id: string
          task_run_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          output_summary?: string | null
          output_type?: string | null
          raw_payload?: Json | null
          source?: string
          success?: boolean
          task_id?: string
          task_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shadow_results_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      state_ownership_registry: {
        Row: {
          created_at: string
          domain: string
          fallback_path: string | null
          id: string
          migration_status: string
          notes: string | null
          owner_layer: string
          read_path: string
          updated_at: string
          write_path: string
        }
        Insert: {
          created_at?: string
          domain: string
          fallback_path?: string | null
          id?: string
          migration_status?: string
          notes?: string | null
          owner_layer: string
          read_path: string
          updated_at?: string
          write_path: string
        }
        Update: {
          created_at?: string
          domain?: string
          fallback_path?: string | null
          id?: string
          migration_status?: string
          notes?: string | null
          owner_layer?: string
          read_path?: string
          updated_at?: string
          write_path?: string
        }
        Relationships: []
      }
      system_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          affected_task_ids: string[]
          created_at: string
          description: string | null
          detected_at: string
          id: string
          incident_type: string
          metadata: Json
          prevention_rule_id: string | null
          project_id: string
          resolved_at: string | null
          rule_closure_notes: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_task_ids?: string[]
          created_at?: string
          description?: string | null
          detected_at?: string
          id?: string
          incident_type: string
          metadata?: Json
          prevention_rule_id?: string | null
          project_id: string
          resolved_at?: string | null
          rule_closure_notes?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_task_ids?: string[]
          created_at?: string
          description?: string | null
          detected_at?: string
          id?: string
          incident_type?: string
          metadata?: Json
          prevention_rule_id?: string | null
          project_id?: string
          resolved_at?: string | null
          rule_closure_notes?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_incidents_prevention_rule_id_fkey"
            columns: ["prevention_rule_id"]
            isOneToOne: false
            referencedRelation: "prevention_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_incidents_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_delivery_gates: {
        Row: {
          artifact_ref: string | null
          created_at: string | null
          evaluated_at: string | null
          evaluator: string | null
          failure_reason: string | null
          gate_name: string
          gate_state: string
          id: string
          metadata: Json | null
          pass_criteria: string | null
          task_id: string
          task_run_id: string | null
          updated_at: string | null
        }
        Insert: {
          artifact_ref?: string | null
          created_at?: string | null
          evaluated_at?: string | null
          evaluator?: string | null
          failure_reason?: string | null
          gate_name: string
          gate_state: string
          id?: string
          metadata?: Json | null
          pass_criteria?: string | null
          task_id: string
          task_run_id?: string | null
          updated_at?: string | null
        }
        Update: {
          artifact_ref?: string | null
          created_at?: string | null
          evaluated_at?: string | null
          evaluator?: string | null
          failure_reason?: string | null
          gate_name?: string
          gate_state?: string
          id?: string
          metadata?: Json | null
          pass_criteria?: string | null
          task_id?: string
          task_run_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_delivery_gates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_delivery_gates_task_run_id_fkey"
            columns: ["task_run_id"]
            isOneToOne: false
            referencedRelation: "task_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          is_hard: boolean
          project_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          is_hard?: boolean
          project_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          is_hard?: boolean
          project_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_dep_fk"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_proj_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_runs: {
        Row: {
          agent_role: string
          attempt_number: number
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          model_used: string | null
          project_id: string
          started_at: string | null
          status: string
          task_id: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          agent_role: string
          attempt_number?: number
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          project_id: string
          started_at?: string | null
          status: string
          task_id: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          agent_role?: string
          attempt_number?: number
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          project_id?: string
          started_at?: string | null
          status?: string
          task_id?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_runs_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_runs_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_cost_usd: number | null
          agent_role: string
          blocked_reason_code: string | null
          completed_at: string | null
          context_payload: Json
          created_at: string
          delivery_type:
            | Database["public"]["Enums"]["task_delivery_type"]
            | null
          description: string | null
          dispatched_at: string | null
          estimated_cost_usd: number | null
          estimated_hours: number | null
          expected_output_schema: Json | null
          failed_at: string | null
          failure_category: string | null
          failure_count: number
          failure_detail: string | null
          failure_suggestion: string | null
          feature_id: string
          gate_state: Database["public"]["Enums"]["task_gate_state"] | null
          gate_state_reason: string | null
          gate_state_updated_at: string | null
          id: string
          infra_failure_type: string | null
          max_retries: number
          order_index: number
          priority: string
          project_id: string
          retry_count: number
          slug: string
          status: string
          task_type: string
          title: string
          unsupported_reason: string | null
          updated_at: string
        }
        Insert: {
          actual_cost_usd?: number | null
          agent_role: string
          blocked_reason_code?: string | null
          completed_at?: string | null
          context_payload?: Json
          created_at?: string
          delivery_type?:
            | Database["public"]["Enums"]["task_delivery_type"]
            | null
          description?: string | null
          dispatched_at?: string | null
          estimated_cost_usd?: number | null
          estimated_hours?: number | null
          expected_output_schema?: Json | null
          failed_at?: string | null
          failure_category?: string | null
          failure_count?: number
          failure_detail?: string | null
          failure_suggestion?: string | null
          feature_id: string
          gate_state?: Database["public"]["Enums"]["task_gate_state"] | null
          gate_state_reason?: string | null
          gate_state_updated_at?: string | null
          id?: string
          infra_failure_type?: string | null
          max_retries?: number
          order_index?: number
          priority?: string
          project_id: string
          retry_count?: number
          slug: string
          status?: string
          task_type: string
          title: string
          unsupported_reason?: string | null
          updated_at?: string
        }
        Update: {
          actual_cost_usd?: number | null
          agent_role?: string
          blocked_reason_code?: string | null
          completed_at?: string | null
          context_payload?: Json
          created_at?: string
          delivery_type?:
            | Database["public"]["Enums"]["task_delivery_type"]
            | null
          description?: string | null
          dispatched_at?: string | null
          estimated_cost_usd?: number | null
          estimated_hours?: number | null
          expected_output_schema?: Json | null
          failed_at?: string | null
          failure_category?: string | null
          failure_count?: number
          failure_detail?: string | null
          failure_suggestion?: string | null
          feature_id?: string
          gate_state?: Database["public"]["Enums"]["task_gate_state"] | null
          gate_state_reason?: string | null
          gate_state_updated_at?: string | null
          id?: string
          infra_failure_type?: string | null
          max_retries?: number
          order_index?: number
          priority?: string
          project_id?: string
          retry_count?: number
          slug?: string
          status?: string
          task_type?: string
          title?: string
          unsupported_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_feature_fk"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          organization_id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          organization_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          organization_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_assumptions: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          assumption_key: string
          created_at: string
          id: string
          label: string
          modified_value: string | null
          project_id: string
          status: string
          updated_at: string
          value: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          assumption_key: string
          created_at?: string
          id?: string
          label: string
          modified_value?: string | null
          project_id: string
          status?: string
          updated_at?: string
          value: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          assumption_key?: string
          created_at?: string
          id?: string
          label?: string
          modified_value?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizard_assumptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_conversations: {
        Row: {
          collected_fields: Json
          created_at: string
          id: string
          messages: Json
          project_id: string
          readiness: number
          trigger_fired: boolean
          trigger_reason: string | null
          triggered_at: string | null
          turn_index: number
          updated_at: string
        }
        Insert: {
          collected_fields?: Json
          created_at?: string
          id?: string
          messages?: Json
          project_id: string
          readiness?: number
          trigger_fired?: boolean
          trigger_reason?: string | null
          triggered_at?: string | null
          turn_index?: number
          updated_at?: string
        }
        Update: {
          collected_fields?: Json
          created_at?: string
          id?: string
          messages?: Json
          project_id?: string
          readiness?: number
          trigger_fired?: boolean
          trigger_reason?: string | null
          triggered_at?: string | null
          turn_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizard_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_sessions: {
        Row: {
          created_at: string
          current_step: string | null
          id: string
          metadata: Json
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: string | null
          id?: string
          metadata?: Json
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizard_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_state: {
        Row: {
          conversation_history: Json
          created_at: string
          first_user_msg: string | null
          id: string
          iris_complete: boolean
          project_id: string
          readiness_score: number
          updated_at: string
        }
        Insert: {
          conversation_history?: Json
          created_at?: string
          first_user_msg?: string | null
          id?: string
          iris_complete?: boolean
          project_id: string
          readiness_score?: number
          updated_at?: string
        }
        Update: {
          conversation_history?: Json
          created_at?: string
          first_user_msg?: string | null
          id?: string
          iris_complete?: boolean
          project_id?: string
          readiness_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizard_state_project_id_fk"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          data: Json
          id: string
          session_id: string
          step_number: number
          step_type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          session_id: string
          step_number: number
          step_type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          session_id?: string
          step_number?: number
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizard_steps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "wizard_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_heartbeats: {
        Row: {
          created_at: string
          id: string
          jobs_processed: number
          last_seen: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jobs_processed?: number
          last_seen?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jobs_processed?: number
          last_seen?: string
          worker_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      credentials_safe_view: {
        Row: {
          created_at: string | null
          created_by: string | null
          encryption_key_ref: string | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          label: string | null
          provider_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          encryption_key_ref?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          label?: string | null
          provider_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          encryption_key_ref?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          label?: string | null
          provider_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credentials_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_provider_fk"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_workspace_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      buildos_acquire_lock:
        | {
            Args: {
              p_duration_sec?: number
              p_lock_type: string
              p_locked_by: string
              p_resource_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_duration_minutes?: number
              p_lock_type?: string
              p_locked_by_run?: string
              p_resource_id: string
              p_resource_type: string
            }
            Returns: Json
          }
      buildos_check_idempotency: {
        Args: {
          p_caller_id: string
          p_idempotency_key: string
          p_operation: string
          p_project_id: string
          p_request_hash: string
        }
        Returns: Json
      }
      buildos_complete_idempotency: {
        Args: {
          p_idempotency_key: string
          p_operation: string
          p_response_body: Json
          p_success?: boolean
        }
        Returns: boolean
      }
      buildos_current_org_id: { Args: never; Returns: string }
      buildos_current_project_ids: { Args: never; Returns: string[] }
      buildos_current_user_role: { Args: never; Returns: string }
      buildos_current_workspace_ids: { Args: never; Returns: string[] }
      buildos_find_duplicate_blocker: {
        Args: { p_blocker_type: string; p_task_id: string }
        Returns: string
      }
      buildos_find_unlockable_tasks: {
        Args: { p_project_id: string }
        Returns: {
          task_id: string
          unlock_reason: string
        }[]
      }
      buildos_release_lock: {
        Args: {
          p_lock_id?: string
          p_resource_id: string
          p_task_run_id?: string
        }
        Returns: boolean
      }
      buildos_sync_task_status_from_qa: { Args: never; Returns: number }
      buildos_write_audit_log: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_type: string
          p_after_state?: Json
          p_before_state?: Json
          p_event_type: string
          p_ip_address?: unknown
          p_metadata?: Json
          p_organization_id: string
          p_project_id: string
          p_resource_id: string
          p_resource_type: string
          p_trace_id?: string
          p_user_agent?: string
          p_workspace_id: string
        }
        Returns: string
      }
      cleanup_expired_file_locks: { Args: never; Returns: number }
      record_gate_transition: {
        Args: {
          p_blocked_code: string
          p_from_state: string
          p_gate_snapshot?: Json
          p_reason: string
          p_task_id: string
          p_task_run_id: string
          p_to_state: string
          p_triggered_by: string
        }
        Returns: string
      }
    }
    Enums: {
      task_delivery_type:
        | "code"
        | "migration"
        | "docs"
        | "infra"
        | "ui"
        | "api"
        | "qa"
        | "review"
        | "schema"
        | "generic"
      task_gate_state:
        | "implementation_output_ready"
        | "file_written"
        | "repo_linked"
        | "commit_recorded"
        | "deployment_pending"
        | "verification_pending"
        | "qa_pending"
        | "completed"
        | "blocked"
        | "unsupported"
        | "infrastructure_blocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      task_delivery_type: [
        "code",
        "migration",
        "docs",
        "infra",
        "ui",
        "api",
        "qa",
        "review",
        "schema",
        "generic",
      ],
      task_gate_state: [
        "implementation_output_ready",
        "file_written",
        "repo_linked",
        "commit_recorded",
        "deployment_pending",
        "verification_pending",
        "qa_pending",
        "completed",
        "blocked",
        "unsupported",
        "infrastructure_blocked",
      ],
    },
  },
} as const
