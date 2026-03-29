-- ============================================================
-- BUILD OS — Migration 015: Project Type Column + User Provisioning
-- Fixes:
--   BUG-009: projects.project_type column missing → PGRST204 → 500 on create
--   BUG-010: No public.users row on signup → FK violation on project create
--   BUG-011: project_environments insert had non-existent 'slug' column (silently failing)
--   BUG-012: project_settings insert had non-existent 'settings' column (silently failing)
-- ============================================================

-- ─── BUG-009: Add project_type column to projects ────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'saas'
  CHECK (project_type IN ('saas','ai_app','marketplace','crm','tool','api','other'));

CREATE INDEX IF NOT EXISTS idx_projects_project_type ON projects (project_type);

-- ─── BUG-010: Auto-provision user + org + workspace on Supabase Auth signup ──
-- This function fires as a trigger on auth.users INSERT.
-- It creates:
--   1. An organization (named after the user's email domain)
--   2. A public.users profile row
--   3. A default workspace inside that organization

CREATE OR REPLACE FUNCTION buildos_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id        uuid;
  v_org_name      text;
  v_org_slug      text;
  v_full_name     text;
  v_email_domain  text;
BEGIN
  -- Extract full name from metadata or derive from email
  v_full_name := COALESCE(
    (NEW.raw_user_meta_data->>'full_name'),
    split_part(NEW.email, '@', 1)
  );

  -- Derive org name/slug from email domain (e.g. "acme.com" → "Acme" / "acme")
  v_email_domain := split_part(NEW.email, '@', 2);
  v_org_name     := initcap(split_part(v_email_domain, '.', 1));
  v_org_slug     := lower(regexp_replace(split_part(v_email_domain, '.', 1), '[^a-z0-9]', '-', 'g'));

  -- Handle slug conflicts by appending partial UUID
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = v_org_slug) THEN
    v_org_slug := v_org_slug || '-' || substring(NEW.id::text, 1, 6);
  END IF;

  -- 1. Create organization
  INSERT INTO organizations (name, slug, plan)
  VALUES (v_org_name, v_org_slug, 'starter')
  RETURNING id INTO v_org_id;

  -- 2. Create public user profile
  INSERT INTO users (id, organization_id, email, full_name, role)
  VALUES (NEW.id, v_org_id, NEW.email, v_full_name, 'owner');

  -- 3. Create default workspace
  INSERT INTO workspaces (organization_id, name, slug, is_default, created_by)
  VALUES (v_org_id, 'Default Workspace', 'default', true, NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log and continue — never block auth signup
    RAISE WARNING 'buildos_handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION buildos_handle_new_user();

-- ─── Grant execute to service_role ───────────────────────────────────────────
GRANT EXECUTE ON FUNCTION buildos_handle_new_user() TO service_role;

-- ─── BUG-FIX: buildos_find_unlockable_tasks excluded order_index=0 tasks ─────
-- Previous version had `AND t.order_index > 0` which permanently blocked all
-- first-tasks in each feature (order_index=0) from ever becoming 'ready'.
-- Fix: remove the exclusion. The `NOT EXISTS (lower-order siblings)` condition
-- already handles it correctly — tasks with order_index=0 have no lower siblings.
CREATE OR REPLACE FUNCTION buildos_find_unlockable_tasks(p_project_id uuid)
RETURNS TABLE(task_id uuid, unlock_reason text) AS $$
BEGIN
  RETURN QUERY
  -- Tasks with no explicit deps where all lower-order siblings in the feature are done
  SELECT t.id, 'order_index_complete'::text
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND NOT EXISTS (
      -- no explicit dep edges on this task
      SELECT 1 FROM task_dependencies td WHERE td.task_id = t.id
    )
    AND NOT EXISTS (
      -- all lower-order tasks in same feature must be completed or cancelled
      SELECT 1 FROM tasks t2
      WHERE t2.feature_id = t.feature_id
        AND t2.order_index < t.order_index
        AND t2.status NOT IN ('completed', 'cancelled')
    )

  UNION ALL

  -- Tasks with explicit deps where ALL deps are completed
  SELECT t.id, 'deps_complete'::text
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND EXISTS (SELECT 1 FROM task_dependencies td WHERE td.task_id = t.id)
    AND NOT EXISTS (
      SELECT 1 FROM task_dependencies td
      JOIN tasks dep ON dep.id = td.depends_on_task_id
      WHERE td.task_id = t.id
        AND dep.status NOT IN ('completed', 'cancelled')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION buildos_find_unlockable_tasks(uuid) TO service_role;
