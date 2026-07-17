-- Personnel Profiles MVP: agency-scoped employment fields, certifications,
-- emergency contacts, and private avatar storage.
-- Do not apply from the Expo client.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.employment_type AS ENUM (
    'full_time',
    'part_time',
    'reserve',
    'volunteer',
    'contractor',
    'civilian',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.certification_status AS ENUM (
    'active',
    'expiring',
    'expired',
    'suspended',
    'revoked'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- Global profile identity fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS work_phone text,
  ADD COLUMN IF NOT EXISTS mobile_phone text;

-- avatar_path already exists from foundation.

-- ---------------------------------------------------------------------------
-- Agency-scoped employment fields on agency_members
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_members
  ADD COLUMN IF NOT EXISTS rank text,
  ADD COLUMN IF NOT EXISTS shift_name text,
  ADD COLUMN IF NOT EXISTS supervisor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS employment_type public.employment_type,
  ADD COLUMN IF NOT EXISTS callsign text,
  ADD COLUMN IF NOT EXISTS radio_number text,
  ADD COLUMN IF NOT EXISTS status_notes text;

CREATE INDEX IF NOT EXISTS agency_members_supervisor_user_id_idx
  ON public.agency_members (supervisor_user_id);

CREATE INDEX IF NOT EXISTS agency_members_employment_type_idx
  ON public.agency_members (agency_id, employment_type);

CREATE INDEX IF NOT EXISTS agency_members_shift_name_idx
  ON public.agency_members (agency_id, shift_name);

-- ---------------------------------------------------------------------------
-- Certifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personnel_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  certification_name text NOT NULL,
  issuing_authority text,
  credential_number text,
  issued_date date,
  expiration_date date,
  status public.certification_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_certifications_name_not_blank CHECK (length(btrim(certification_name)) > 0)
);

CREATE INDEX IF NOT EXISTS personnel_certifications_agency_user_idx
  ON public.personnel_certifications (agency_id, user_id);

CREATE INDEX IF NOT EXISTS personnel_certifications_expiration_idx
  ON public.personnel_certifications (agency_id, expiration_date);

DROP TRIGGER IF EXISTS personnel_certifications_set_updated_at ON public.personnel_certifications;
CREATE TRIGGER personnel_certifications_set_updated_at
  BEFORE UPDATE ON public.personnel_certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.personnel_certifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Emergency contacts (restricted)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personnel_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text,
  phone text NOT NULL,
  alternate_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_emergency_contacts_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT personnel_emergency_contacts_phone_not_blank CHECK (length(btrim(phone)) > 0)
);

CREATE INDEX IF NOT EXISTS personnel_emergency_contacts_agency_user_idx
  ON public.personnel_emergency_contacts (agency_id, user_id);

DROP TRIGGER IF EXISTS personnel_emergency_contacts_set_updated_at ON public.personnel_emergency_contacts;
CREATE TRIGGER personnel_emergency_contacts_set_updated_at
  BEFORE UPDATE ON public.personnel_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.personnel_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_emergency_contacts(
  target_agency_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND target_agency_id IS NOT NULL
    AND target_user_id IS NOT NULL
    AND (
      auth.uid() = target_user_id
      OR public.can_manage_personnel(target_agency_id)
    )
    AND (
      auth.uid() = target_user_id
      OR public.is_active_agency_member(target_agency_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.agency_members m
      WHERE m.agency_id = target_agency_id
        AND m.user_id = target_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_certifications(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_personnel(target_agency_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_certifications(
  target_agency_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.is_active_agency_member(target_agency_id)
    AND EXISTS (
      SELECT 1
      FROM public.agency_members m
      WHERE m.agency_id = target_agency_id
        AND m.user_id = target_user_id
    )
    AND (
      auth.uid() = target_user_id
      OR public.has_agency_role(
        target_agency_id,
        ARRAY['agency_admin', 'command_staff', 'supervisor']::public.agency_role[]
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.personnel_avatar_path_agency_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.uuid_from_path_segment(split_part(object_name, '/', 1));
$$;

CREATE OR REPLACE FUNCTION public.personnel_avatar_path_user_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.uuid_from_path_segment(split_part(object_name, '/', 2));
$$;

CREATE OR REPLACE FUNCTION public.can_access_personnel_avatar_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.personnel_avatar_path_agency_id(object_name) IS NOT NULL
    AND public.personnel_avatar_path_user_id(object_name) IS NOT NULL
    AND split_part(object_name, '/', 3) <> ''
    AND split_part(object_name, '/', 4) = ''
    AND public.is_active_agency_member(public.personnel_avatar_path_agency_id(object_name))
    AND EXISTS (
      SELECT 1
      FROM public.agency_members m
      WHERE m.agency_id = public.personnel_avatar_path_agency_id(object_name)
        AND m.user_id = public.personnel_avatar_path_user_id(object_name)
        AND m.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_personnel_avatar_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.personnel_avatar_path_agency_id(object_name) IS NOT NULL
    AND public.personnel_avatar_path_user_id(object_name) IS NOT NULL
    AND split_part(object_name, '/', 3) <> ''
    AND split_part(object_name, '/', 4) = ''
    AND (
      auth.uid() = public.personnel_avatar_path_user_id(object_name)
      OR public.can_manage_personnel(public.personnel_avatar_path_agency_id(object_name))
    )
    AND public.is_active_agency_member(public.personnel_avatar_path_agency_id(object_name));
$$;

-- Personal profile fields (own user only; email protected by existing trigger).
CREATE OR REPLACE FUNCTION public.update_own_personnel_profile(
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_preferred_name text DEFAULT NULL,
  p_pronouns text DEFAULT NULL,
  p_work_phone text DEFAULT NULL,
  p_mobile_phone text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  row_data public.profiles%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles p
  SET
    first_name = CASE WHEN p_first_name IS NULL THEN p.first_name ELSE NULLIF(btrim(p_first_name), '') END,
    last_name = CASE WHEN p_last_name IS NULL THEN p.last_name ELSE NULLIF(btrim(p_last_name), '') END,
    display_name = CASE WHEN p_display_name IS NULL THEN p.display_name ELSE NULLIF(btrim(p_display_name), '') END,
    preferred_name = CASE WHEN p_preferred_name IS NULL THEN p.preferred_name ELSE NULLIF(btrim(p_preferred_name), '') END,
    pronouns = CASE WHEN p_pronouns IS NULL THEN p.pronouns ELSE NULLIF(btrim(p_pronouns), '') END,
    work_phone = CASE WHEN p_work_phone IS NULL THEN p.work_phone ELSE NULLIF(btrim(p_work_phone), '') END,
    mobile_phone = CASE WHEN p_mobile_phone IS NULL THEN p.mobile_phone ELSE NULLIF(btrim(p_mobile_phone), '') END,
    phone = CASE WHEN p_phone IS NULL THEN p.phone ELSE NULLIF(btrim(p_phone), '') END,
    updated_at = now()
  WHERE p.id = me
  RETURNING * INTO row_data;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_personnel_avatar_path(
  p_agency_id uuid,
  p_user_id uuid,
  p_avatar_path text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := NULLIF(btrim(COALESCE(p_avatar_path, '')), '');
  row_data public.profiles%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_agency_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Agency and user are required';
  END IF;

  IF NOT (
    me = p_user_id
    OR public.can_manage_personnel(p_agency_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed to update this avatar';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_members m
    WHERE m.agency_id = p_agency_id
      AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  IF cleaned IS NOT NULL AND (
    public.personnel_avatar_path_agency_id(cleaned) IS DISTINCT FROM p_agency_id
    OR public.personnel_avatar_path_user_id(cleaned) IS DISTINCT FROM p_user_id
  ) THEN
    RAISE EXCEPTION 'Avatar path does not match agency and user';
  END IF;

  UPDATE public.profiles p
  SET avatar_path = cleaned,
      updated_at = now()
  WHERE p.id = p_user_id
  RETURNING * INTO row_data;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN row_data;
END;
$$;

-- Employment/assignment fields (managers only). Role changes stay on update_agency_membership.
CREATE OR REPLACE FUNCTION public.update_agency_employment(
  p_membership_id uuid,
  p_rank text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_shift_name text DEFAULT NULL,
  p_supervisor_user_id uuid DEFAULT NULL,
  p_clear_supervisor boolean DEFAULT false,
  p_badge_number text DEFAULT NULL,
  p_employee_number text DEFAULT NULL,
  p_hire_date date DEFAULT NULL,
  p_clear_hire_date boolean DEFAULT false,
  p_employment_type public.employment_type DEFAULT NULL,
  p_clear_employment_type boolean DEFAULT false,
  p_callsign text DEFAULT NULL,
  p_radio_number text DEFAULT NULL,
  p_status_notes text DEFAULT NULL
)
RETURNS public.agency_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  member_row public.agency_members%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO member_row
  FROM public.agency_members m
  WHERE m.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  IF NOT public.can_manage_personnel(member_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may update employment details';
  END IF;

  IF p_supervisor_user_id IS NOT NULL THEN
    IF p_supervisor_user_id = member_row.user_id THEN
      RAISE EXCEPTION 'A member cannot be their own supervisor';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.agency_members s
      WHERE s.agency_id = member_row.agency_id
        AND s.user_id = p_supervisor_user_id
        AND s.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Supervisor must be an active member of the same agency';
    END IF;
  END IF;

  UPDATE public.agency_members
  SET
    rank = CASE WHEN p_rank IS NULL THEN rank ELSE NULLIF(btrim(p_rank), '') END,
    title = CASE WHEN p_title IS NULL THEN title ELSE NULLIF(btrim(p_title), '') END,
    unit = CASE WHEN p_unit IS NULL THEN unit ELSE NULLIF(btrim(p_unit), '') END,
    shift_name = CASE WHEN p_shift_name IS NULL THEN shift_name ELSE NULLIF(btrim(p_shift_name), '') END,
    supervisor_user_id = CASE
      WHEN p_clear_supervisor THEN NULL
      WHEN p_supervisor_user_id IS NULL THEN supervisor_user_id
      ELSE p_supervisor_user_id
    END,
    badge_number = CASE WHEN p_badge_number IS NULL THEN badge_number ELSE NULLIF(btrim(p_badge_number), '') END,
    employee_number = CASE WHEN p_employee_number IS NULL THEN employee_number ELSE NULLIF(btrim(p_employee_number), '') END,
    hire_date = CASE
      WHEN p_clear_hire_date THEN NULL
      WHEN p_hire_date IS NULL THEN hire_date
      ELSE p_hire_date
    END,
    employment_type = CASE
      WHEN p_clear_employment_type THEN NULL
      WHEN p_employment_type IS NULL THEN employment_type
      ELSE p_employment_type
    END,
    callsign = CASE WHEN p_callsign IS NULL THEN callsign ELSE NULLIF(btrim(p_callsign), '') END,
    radio_number = CASE WHEN p_radio_number IS NULL THEN radio_number ELSE NULLIF(btrim(p_radio_number), '') END,
    status_notes = CASE WHEN p_status_notes IS NULL THEN status_notes ELSE NULLIF(btrim(p_status_notes), '') END,
    updated_at = now()
  WHERE id = member_row.id
  RETURNING * INTO member_row;

  RETURN member_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: certifications
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS personnel_certifications_select ON public.personnel_certifications;
CREATE POLICY personnel_certifications_select
  ON public.personnel_certifications
  FOR SELECT
  TO authenticated
  USING (public.can_view_certifications(agency_id, user_id));

DROP POLICY IF EXISTS personnel_certifications_insert ON public.personnel_certifications;
CREATE POLICY personnel_certifications_insert
  ON public.personnel_certifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_certifications(agency_id));

DROP POLICY IF EXISTS personnel_certifications_update ON public.personnel_certifications;
CREATE POLICY personnel_certifications_update
  ON public.personnel_certifications
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_certifications(agency_id))
  WITH CHECK (public.can_manage_certifications(agency_id));

DROP POLICY IF EXISTS personnel_certifications_delete ON public.personnel_certifications;
CREATE POLICY personnel_certifications_delete
  ON public.personnel_certifications
  FOR DELETE
  TO authenticated
  USING (public.can_manage_certifications(agency_id));

-- ---------------------------------------------------------------------------
-- RLS: emergency contacts (self + managers only)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS personnel_emergency_contacts_select ON public.personnel_emergency_contacts;
CREATE POLICY personnel_emergency_contacts_select
  ON public.personnel_emergency_contacts
  FOR SELECT
  TO authenticated
  USING (public.can_view_emergency_contacts(agency_id, user_id));

DROP POLICY IF EXISTS personnel_emergency_contacts_insert ON public.personnel_emergency_contacts;
CREATE POLICY personnel_emergency_contacts_insert
  ON public.personnel_emergency_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_view_emergency_contacts(agency_id, user_id)
    AND (
      auth.uid() = user_id
      OR public.can_manage_personnel(agency_id)
    )
  );

DROP POLICY IF EXISTS personnel_emergency_contacts_update ON public.personnel_emergency_contacts;
CREATE POLICY personnel_emergency_contacts_update
  ON public.personnel_emergency_contacts
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_manage_personnel(agency_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.can_manage_personnel(agency_id)
  );

DROP POLICY IF EXISTS personnel_emergency_contacts_delete ON public.personnel_emergency_contacts;
CREATE POLICY personnel_emergency_contacts_delete
  ON public.personnel_emergency_contacts
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_manage_personnel(agency_id)
  );

-- ---------------------------------------------------------------------------
-- Avatar storage bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'personnel-avatars',
  'personnel-avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS personnel_avatars_storage_select ON storage.objects;
CREATE POLICY personnel_avatars_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'personnel-avatars'
    AND public.can_access_personnel_avatar_object(name)
  );

DROP POLICY IF EXISTS personnel_avatars_storage_insert ON storage.objects;
CREATE POLICY personnel_avatars_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'personnel-avatars'
    AND public.can_manage_personnel_avatar_object(name)
  );

DROP POLICY IF EXISTS personnel_avatars_storage_update ON storage.objects;
CREATE POLICY personnel_avatars_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'personnel-avatars'
    AND public.can_manage_personnel_avatar_object(name)
  )
  WITH CHECK (
    bucket_id = 'personnel-avatars'
    AND public.can_manage_personnel_avatar_object(name)
  );

DROP POLICY IF EXISTS personnel_avatars_storage_delete ON storage.objects;
CREATE POLICY personnel_avatars_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'personnel-avatars'
    AND public.can_manage_personnel_avatar_object(name)
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.can_view_emergency_contacts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_certifications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_certifications(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.personnel_avatar_path_agency_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.personnel_avatar_path_user_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_personnel_avatar_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_personnel_avatar_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_own_personnel_profile(text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_personnel_avatar_path(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_agency_employment(uuid, text, text, text, text, uuid, boolean, text, text, date, boolean, public.employment_type, boolean, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_view_emergency_contacts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_certifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_certifications(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personnel_avatar_path_agency_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personnel_avatar_path_user_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_personnel_avatar_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_personnel_avatar_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_personnel_profile(text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_personnel_avatar_path(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_employment(uuid, text, text, text, text, uuid, boolean, text, text, date, boolean, public.employment_type, boolean, text, text, text) TO authenticated;

REVOKE ALL ON TABLE public.personnel_certifications FROM PUBLIC;
REVOKE ALL ON TABLE public.personnel_certifications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personnel_certifications TO authenticated;

REVOKE ALL ON TABLE public.personnel_emergency_contacts FROM PUBLIC;
REVOKE ALL ON TABLE public.personnel_emergency_contacts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personnel_emergency_contacts TO authenticated;

COMMIT;
