-- migrations/20240402_create_user_with_membership_rpc.sql

-- ============================================================
-- Function: create_user_with_membership
-- Purpose:  Atomically create an admin user with full profile
--           and org membership in a single transaction.
--           Replaces scattered raw inserts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_user_with_membership(
  p_email          TEXT,
  p_password       TEXT,
  p_full_name      TEXT,
  p_org_id         UUID,
  p_role           TEXT    DEFAULT 'admin',
  p_metadata       JSONB   DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id        UUID;
  v_encrypted_pw   TEXT;
  v_now            TIMESTAMPTZ := NOW();
  v_result         JSONB;
BEGIN

  -- ── 1. Validate inputs ────────────────────────────────────
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RAISE EXCEPTION 'create_user_with_membership: email is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_password IS NULL OR LENGTH(p_password) < 8 THEN
    RAISE EXCEPTION 'create_user_with_membership: password must be at least 8 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'create_user_with_membership: org_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_role NOT IN ('admin', 'owner', 'member', 'viewer') THEN
    RAISE EXCEPTION 'create_user_with_membership: invalid role "%"', p_role
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── 2. Check for duplicate email ──────────────────────────
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE email = LOWER(TRIM(p_email))
  ) THEN
    RAISE EXCEPTION 'create_user_with_membership: user with email "%" already exists', p_email
      USING ERRCODE = 'unique_violation';
  END IF;

  -- ── 3. Check org exists ───────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id
  ) THEN
    RAISE EXCEPTION 'create_user_with_membership: organization "%" not found', p_org_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── 4. Generate user ID ───────────────────────────────────
  v_user_id := gen_random_uuid();

  -- ── 5. Encrypt password using pgcrypto ────────────────────
  v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

  -- ── 6. Insert into auth.users ─────────────────────────────
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    created_at,
    updated_at,
    aud,
    confirmation_token
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',   -- default instance
    LOWER(TRIM(p_email)),
    v_encrypted_pw,
    v_now,                                     -- auto-confirm email
    jsonb_build_object(
      'provider',  'email',
      'providers', ARRAY['email']
    ),
    jsonb_build_object(
      'full_name', p_full_name
    ) || p_metadata,
    FALSE,
    'authenticated',
    v_now,
    v_now,
    'authenticated',
    ''
  );

  -- ── 7. Upsert public profile ──────────────────────────────
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    LOWER(TRIM(p_email)),
    p_full_name,
    v_now,
    v_now
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email      = EXCLUDED.email,
      full_name  = EXCLUDED.full_name,
      updated_at = v_now;

  -- ── 8. Create membership record ───────────────────────────
  INSERT INTO public.memberships (
    user_id,
    org_id,
    role,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_org_id,
    p_role,
    v_now,
    v_now
  )
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET
      role       = EXCLUDED.role,
      updated_at = v_now;

  -- ── 9. Build and return result ────────────────────────────
  v_result := jsonb_build_object(
    'success',    TRUE,
    'user_id',    v_user_id,
    'email',      LOWER(TRIM(p_email)),
    'full_name',  p_full_name,
    'org_id',     p_org_id,
    'role',       p_role,
    'created_at', v_now
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with context for upstream error handling
    RAISE EXCEPTION 'create_user_with_membership failed: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE
      USING ERRCODE = SQLSTATE;
END;
$$;

-- ── Security & Permissions ────────────────────────────────────
-- Only service_role can invoke this function directly.
-- anon and authenticated roles should NOT have access.
REVOKE ALL ON FUNCTION public.create_user_with_membership(
  TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_user_with_membership(
  TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_user_with_membership(
  TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO service_role;

-- ── Documentation ─────────────────────────────────────────────
COMMENT ON FUNCTION public.create_user_with_membership IS
  'Atomically creates an auth user, public profile, and org membership. '
  'Call via service_role only. Replaces raw multi-table inserts for admin '
  'user creation. Returns JSONB with {success, user_id, email, org_id, role, created_at}.';