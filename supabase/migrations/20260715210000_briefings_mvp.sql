-- Blue Briefing: briefings / pass-on MVP
-- Tables, indexes, triggers, helpers, and RLS. Agency-scoped; no USING (true).

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'briefing_priority') THEN
    CREATE TYPE public.briefing_priority AS ENUM (
      'critical',
      'high',
      'medium',
      'low'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'briefing_status') THEN
    CREATE TYPE public.briefing_status AS ENUM (
      'active',
      'resolved',
      'archived'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id),
  title text NOT NULL,
  body text NOT NULL,
  shift_name text,
  category text,
  priority public.briefing_priority NOT NULL DEFAULT 'medium',
  status public.briefing_status NOT NULL DEFAULT 'active',
  case_number text,
  location text,
  tags text[] NOT NULL DEFAULT '{}',
  is_pinned boolean NOT NULL DEFAULT false,
  requires_acknowledgement boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT briefings_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT briefings_body_not_blank CHECK (length(btrim(body)) > 0)
);

CREATE TABLE IF NOT EXISTS public.briefing_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid NOT NULL REFERENCES public.briefings (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (briefing_id, user_id)
);

CREATE INDEX IF NOT EXISTS briefings_agency_id_idx
  ON public.briefings (agency_id);

CREATE INDEX IF NOT EXISTS briefings_created_at_desc_idx
  ON public.briefings (created_at DESC);

CREATE INDEX IF NOT EXISTS briefings_priority_idx
  ON public.briefings (priority);

CREATE INDEX IF NOT EXISTS briefings_status_idx
  ON public.briefings (status);

CREATE INDEX IF NOT EXISTS briefings_is_pinned_idx
  ON public.briefings (is_pinned);

CREATE INDEX IF NOT EXISTS briefings_author_id_idx
  ON public.briefings (author_id);

CREATE INDEX IF NOT EXISTS briefings_agency_status_pinned_created_idx
  ON public.briefings (agency_id, status, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS briefing_acknowledgements_briefing_id_idx
  ON public.briefing_acknowledgements (briefing_id);

CREATE INDEX IF NOT EXISTS briefing_acknowledgements_user_id_idx
  ON public.briefing_acknowledgements (user_id);

CREATE INDEX IF NOT EXISTS briefing_acknowledgements_agency_id_idx
  ON public.briefing_acknowledgements (agency_id);

DROP TRIGGER IF EXISTS briefings_set_updated_at ON public.briefings;
CREATE TRIGGER briefings_set_updated_at
  BEFORE UPDATE ON public.briefings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_agency_role(
  target_agency_id uuid,
  allowed_roles public.agency_role[]
)
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
      AND m.role = ANY (allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.briefing_belongs_to_agency(
  target_briefing_id uuid,
  target_agency_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.briefings b
    WHERE b.id = target_briefing_id
      AND b.agency_id = target_agency_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_agency_role(uuid, public.agency_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.briefing_belongs_to_agency(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_agency_role(uuid, public.agency_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.briefing_belongs_to_agency(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefing_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Briefings: select
DROP POLICY IF EXISTS briefings_select_agency_member ON public.briefings;
CREATE POLICY briefings_select_agency_member
  ON public.briefings
  FOR SELECT
  TO authenticated
  USING (public.is_active_agency_member(agency_id));

-- Briefings: insert (own author, own agency membership)
DROP POLICY IF EXISTS briefings_insert_agency_member ON public.briefings;
CREATE POLICY briefings_insert_agency_member
  ON public.briefings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_active_agency_member(agency_id)
  );

-- Briefings: author may update own active briefing
DROP POLICY IF EXISTS briefings_update_own_active ON public.briefings;
CREATE POLICY briefings_update_own_active
  ON public.briefings
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    AND status = 'active'
    AND public.is_active_agency_member(agency_id)
  )
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_active_agency_member(agency_id)
  );

-- Briefings: supervisory update (pin / resolve / archive / edit)
DROP POLICY IF EXISTS briefings_update_supervisory ON public.briefings;
CREATE POLICY briefings_update_supervisory
  ON public.briefings
  FOR UPDATE
  TO authenticated
  USING (
    public.has_agency_role(
      agency_id,
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    )
  )
  WITH CHECK (
    public.has_agency_role(
      agency_id,
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    )
  );

-- Briefings: delete (admin / command only)
DROP POLICY IF EXISTS briefings_delete_command ON public.briefings;
CREATE POLICY briefings_delete_command
  ON public.briefings
  FOR DELETE
  TO authenticated
  USING (
    public.has_agency_role(
      agency_id,
      ARRAY['agency_admin', 'command_staff']::public.agency_role[]
    )
  );

-- Acknowledgements: select in agency
DROP POLICY IF EXISTS briefing_acks_select_agency_member ON public.briefing_acknowledgements;
CREATE POLICY briefing_acks_select_agency_member
  ON public.briefing_acknowledgements
  FOR SELECT
  TO authenticated
  USING (public.is_active_agency_member(agency_id));

-- Acknowledgements: insert own only, matching briefing agency
DROP POLICY IF EXISTS briefing_acks_insert_own ON public.briefing_acknowledgements;
CREATE POLICY briefing_acks_insert_own
  ON public.briefing_acknowledgements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_agency_member(agency_id)
    AND public.briefing_belongs_to_agency(briefing_id, agency_id)
  );

-- Acknowledgements: delete own only
DROP POLICY IF EXISTS briefing_acks_delete_own ON public.briefing_acknowledgements;
CREATE POLICY briefing_acks_delete_own
  ON public.briefing_acknowledgements
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_active_agency_member(agency_id)
  );

COMMIT;
