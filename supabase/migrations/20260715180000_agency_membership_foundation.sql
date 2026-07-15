-- Blue Briefing: agency membership foundation
-- Enums, agencies, profiles, agency_members, triggers, and RLS.
-- Apply via Supabase SQL Editor or CLI. Do not use USING (true) / WITH CHECK (true).

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agency_role') THEN
    CREATE TYPE public.agency_role AS ENUM (
      'agency_admin',
      'command_staff',
      'supervisor',
      'officer',
      'dispatcher',
      'civilian_staff'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
    CREATE TYPE public.membership_status AS ENUM (
      'pending',
      'active',
      'suspended',
      'removed'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  avatar_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agency_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.agency_role NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'pending',
  badge_number text,
  unit text,
  title text,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS agency_members_user_id_idx
  ON public.agency_members (user_id);

CREATE INDEX IF NOT EXISTS agency_members_agency_id_idx
  ON public.agency_members (agency_id);

CREATE INDEX IF NOT EXISTS agency_members_status_idx
  ON public.agency_members (status);

CREATE INDEX IF NOT EXISTS agency_members_agency_status_role_idx
  ON public.agency_members (agency_id, status, role);

CREATE INDEX IF NOT EXISTS agencies_is_active_idx
  ON public.agencies (is_active);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_set_updated_at ON public.agencies;
CREATE TRIGGER agencies_set_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_members_set_updated_at ON public.agency_members;
CREATE TRIGGER agency_members_set_updated_at
  BEFORE UPDATE ON public.agency_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap from auth.users
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_first text := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'first_name', '')), '');
  meta_last text := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')), '');
  computed_display text;
BEGIN
  computed_display := NULLIF(btrim(concat_ws(' ', meta_first, meta_last)), '');

  INSERT INTO public.profiles (id, first_name, last_name, display_name, email)
  VALUES (NEW.id, meta_first, meta_last, computed_display, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Prevent clients from changing profile identity fields.
CREATE OR REPLACE FUNCTION public.protect_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  -- Email is owned by auth.users; keep profile email stable from client updates.
  NEW.email := OLD.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_identity ON public.profiles;
CREATE TRIGGER profiles_protect_identity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_identity();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER + fixed search_path, no recursion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_agency_member(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_members m
    WHERE m.agency_id = target_agency_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_active_agency_with(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_members mine
    INNER JOIN public.agency_members theirs
      ON theirs.agency_id = mine.agency_id
    WHERE mine.user_id = auth.uid()
      AND mine.status = 'active'
      AND theirs.user_id = target_user_id
      AND theirs.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_agency_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_active_agency_with(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_agency_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_active_agency_with(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_agency_peers ON public.profiles;
CREATE POLICY profiles_select_agency_peers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.shares_active_agency_with(id));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Agencies: active members may read their agency; no client writes in this phase.
DROP POLICY IF EXISTS agencies_select_active_member ON public.agencies;
CREATE POLICY agencies_select_active_member
  ON public.agencies
  FOR SELECT
  TO authenticated
  USING (public.is_active_agency_member(id));

-- Agency members
DROP POLICY IF EXISTS agency_members_select_own ON public.agency_members;
CREATE POLICY agency_members_select_own
  ON public.agency_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS agency_members_select_active_peers ON public.agency_members;
CREATE POLICY agency_members_select_active_peers
  ON public.agency_members
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND public.is_active_agency_member(agency_id)
  );

-- Intentionally no INSERT/UPDATE/DELETE policies for agencies or agency_members.
-- Membership administration will use trusted server-side workflows later.

COMMIT;
