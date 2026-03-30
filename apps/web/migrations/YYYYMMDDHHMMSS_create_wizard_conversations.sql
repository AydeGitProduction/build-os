-- migrations/YYYYMMDDHHMMSS_create_wizard_conversations.sql

CREATE TABLE IF NOT EXISTS public.wizard_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  messages        jsonb,
  collected_fields jsonb,
  turn_index      integer DEFAULT 0,
  readiness       numeric(5, 2) DEFAULT 0,
  trigger_fired   boolean DEFAULT false,
  trigger_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for the most common lookup pattern
CREATE INDEX IF NOT EXISTS idx_wizard_conversations_project_id
  ON public.wizard_conversations (project_id);

-- RLS is intentionally NOT enabled on this table for direct row operations;
-- all access goes through the admin client which bypasses RLS.
-- If you prefer RLS, enable it and add appropriate policies.