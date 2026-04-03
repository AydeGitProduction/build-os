-- ============================================================
-- PHASE 2 MIGRATION — Blueprint Generator Schema Patch
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zyvpoyxdxedcugtdrluc/sql
--
-- Purpose: Allow wizard-generated blueprints without a questionnaire.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Make blueprints.questionnaire_id nullable (wizard flow has no questionnaire)
ALTER TABLE public.blueprints
  ALTER COLUMN questionnaire_id DROP NOT NULL;

-- 2. Add wizard_conversation_id to blueprints so we can trace back to the idea
ALTER TABLE public.blueprints
  ADD COLUMN IF NOT EXISTS wizard_conversation_id UUID
    REFERENCES public.wizard_conversations(id) ON DELETE SET NULL;

-- 3. Add dependency_slugs JSONB to tasks for ordering (avoids needing a separate deps table)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS dependency_slugs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Verify
DO $$
DECLARE
  col_nullable BOOLEAN;
BEGIN
  SELECT is_nullable = 'YES' INTO col_nullable
    FROM information_schema.columns
   WHERE table_name = 'blueprints' AND column_name = 'questionnaire_id';
  IF NOT col_nullable THEN
    RAISE EXCEPTION 'questionnaire_id is still NOT NULL — migration failed';
  END IF;
  RAISE NOTICE 'PHASE 2 MIGRATION COMPLETE: blueprints.questionnaire_id is now nullable.';
END $$;
