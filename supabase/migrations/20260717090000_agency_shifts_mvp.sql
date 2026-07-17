-- Agency Shifts & Personnel Assignments MVP.
-- Soft-deactivate shifts; do not hard-delete rows with assignment history.
-- Do not apply from the Expo client.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  shift_code text,
  start_time time,
  end_time time,
  color_key text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_shifts_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_shifts_agency_name_normalized_uidx
  ON public.agency_shifts (agency_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS agency_shifts_agency_id_idx
  ON public.agency_shifts (agency_id);

CREATE INDEX IF NOT EXISTS agency_shifts_agency_active_sort_idx
  ON public.agency_shifts (agency_id, is_active, sort_order, name);

DROP TRIGGER IF EXISTS agency_shifts_set_updated_at ON public.agency_shifts;
CREATE TRIGGER agency_shifts_set_updated_at
  BEFORE UPDATE ON public.agency_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.personnel_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.agency_shifts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  assignment_type text NOT NULL DEFAULT 'primary'
    CHECK (assignment_type IN ('primary', 'secondary', 'temporary')),
  effective_start date,
  effective_end date,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_shift_assignments_dates_ok CHECK (
    effective_end IS NULL
    OR effective_start IS NULL
    OR effective_end >= effective_start
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_shift_assignments_one_active_primary_uidx
  ON public.personnel_shift_assignments (agency_id, user_id)
  WHERE is_active = true AND assignment_type = 'primary';

CREATE UNIQUE INDEX IF NOT EXISTS personnel_shift_assignments_active_shift_user_uidx
  ON public.personnel_shift_assignments (shift_id, user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS personnel_shift_assignments_agency_user_idx
  ON public.personnel_shift_assignments (agency_id, user_id);

CREATE INDEX IF NOT EXISTS personnel_shift_assignments_agency_shift_idx
  ON public.personnel_shift_assignments (agency_id, shift_id)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS personnel_shift_assignments_set_updated_at ON public.personnel_shift_assignments;
CREATE TRIGGER personnel_shift_assignments_set_updated_at
  BEFORE UPDATE ON public.personnel_shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.shift_supervisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.agency_shifts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, user_id)
);

CREATE INDEX IF NOT EXISTS shift_supervisors_agency_shift_idx
  ON public.shift_supervisors (agency_id, shift_id);

CREATE INDEX IF NOT EXISTS shift_supervisors_agency_user_idx
  ON public.shift_supervisors (agency_id, user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_shift_supervisor(
  target_agency_id uuid,
  target_shift_id uuid
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
      FROM public.shift_supervisors s
      WHERE s.agency_id = target_agency_id
        AND s.shift_id = target_shift_id
        AND s.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_shift_catalog(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_personnel(target_agency_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_shift_assignments(
  target_agency_id uuid,
  target_shift_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_personnel(target_agency_id)
    OR (
      public.has_agency_role(
        target_agency_id,
        ARRAY['supervisor']::public.agency_role[]
      )
      AND public.is_shift_supervisor(target_agency_id, target_shift_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.sync_member_legacy_shift_name(
  p_agency_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_name text;
BEGIN
  SELECT sh.name
  INTO primary_name
  FROM public.personnel_shift_assignments a
  JOIN public.agency_shifts sh ON sh.id = a.shift_id
  WHERE a.agency_id = p_agency_id
    AND a.user_id = p_user_id
    AND a.is_active = true
    AND a.assignment_type = 'primary'
  ORDER BY a.updated_at DESC
  LIMIT 1;

  UPDATE public.agency_members
  SET
    shift_name = primary_name,
    updated_at = now()
  WHERE agency_id = p_agency_id
    AND user_id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs: shifts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_agency_shift(
  p_agency_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_shift_code text DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_color_key text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL
)
RETURNS public.agency_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := NULLIF(btrim(COALESCE(p_name, '')), '');
  next_sort integer;
  shift_row public.agency_shifts%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;
  IF cleaned IS NULL THEN
    RAISE EXCEPTION 'Shift name is required';
  END IF;
  IF lower(cleaned) = 'other' THEN
    RAISE EXCEPTION 'Enter a specific shift name instead of Other';
  END IF;
  IF NOT public.can_manage_shift_catalog(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage shifts';
  END IF;

  IF p_sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1
    INTO next_sort
    FROM public.agency_shifts
    WHERE agency_id = p_agency_id;
  ELSE
    next_sort := p_sort_order;
  END IF;

  INSERT INTO public.agency_shifts (
    agency_id,
    name,
    description,
    shift_code,
    start_time,
    end_time,
    color_key,
    sort_order,
    created_by
  )
  VALUES (
    p_agency_id,
    cleaned,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_shift_code, '')), ''),
    p_start_time,
    p_end_time,
    NULLIF(btrim(COALESCE(p_color_key, '')), ''),
    next_sort,
    me
  )
  RETURNING * INTO shift_row;

  RETURN shift_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A shift with this name already exists for the agency';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_shift(
  p_shift_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_clear_description boolean DEFAULT false,
  p_shift_code text DEFAULT NULL,
  p_clear_shift_code boolean DEFAULT false,
  p_start_time time DEFAULT NULL,
  p_clear_start_time boolean DEFAULT false,
  p_end_time time DEFAULT NULL,
  p_clear_end_time boolean DEFAULT false,
  p_color_key text DEFAULT NULL,
  p_clear_color_key boolean DEFAULT false,
  p_sort_order integer DEFAULT NULL
)
RETURNS public.agency_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  shift_row public.agency_shifts%ROWTYPE;
  cleaned text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO shift_row FROM public.agency_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;
  IF NOT public.can_manage_shift_catalog(shift_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage shifts';
  END IF;

  IF p_name IS NOT NULL THEN
    cleaned := NULLIF(btrim(p_name), '');
    IF cleaned IS NULL THEN
      RAISE EXCEPTION 'Shift name is required';
    END IF;
    IF lower(cleaned) = 'other' THEN
      RAISE EXCEPTION 'Enter a specific shift name instead of Other';
    END IF;
    shift_row.name := cleaned;
  END IF;

  IF p_clear_description THEN
    shift_row.description := NULL;
  ELSIF p_description IS NOT NULL THEN
    shift_row.description := NULLIF(btrim(p_description), '');
  END IF;

  IF p_clear_shift_code THEN
    shift_row.shift_code := NULL;
  ELSIF p_shift_code IS NOT NULL THEN
    shift_row.shift_code := NULLIF(btrim(p_shift_code), '');
  END IF;

  IF p_clear_start_time THEN
    shift_row.start_time := NULL;
  ELSIF p_start_time IS NOT NULL THEN
    shift_row.start_time := p_start_time;
  END IF;

  IF p_clear_end_time THEN
    shift_row.end_time := NULL;
  ELSIF p_end_time IS NOT NULL THEN
    shift_row.end_time := p_end_time;
  END IF;

  IF p_clear_color_key THEN
    shift_row.color_key := NULL;
  ELSIF p_color_key IS NOT NULL THEN
    shift_row.color_key := NULLIF(btrim(p_color_key), '');
  END IF;

  IF p_sort_order IS NOT NULL THEN
    shift_row.sort_order := p_sort_order;
  END IF;

  UPDATE public.agency_shifts
  SET
    name = shift_row.name,
    description = shift_row.description,
    shift_code = shift_row.shift_code,
    start_time = shift_row.start_time,
    end_time = shift_row.end_time,
    color_key = shift_row.color_key,
    sort_order = shift_row.sort_order,
    updated_at = now()
  WHERE id = p_shift_id
  RETURNING * INTO shift_row;

  -- Keep legacy free-text names aligned for members with this primary shift.
  UPDATE public.agency_members m
  SET
    shift_name = shift_row.name,
    updated_at = now()
  FROM public.personnel_shift_assignments a
  WHERE a.agency_id = shift_row.agency_id
    AND a.shift_id = shift_row.id
    AND a.user_id = m.user_id
    AND m.agency_id = shift_row.agency_id
    AND a.is_active = true
    AND a.assignment_type = 'primary';

  RETURN shift_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A shift with this name already exists for the agency';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agency_shift_active(
  p_shift_id uuid,
  p_is_active boolean
)
RETURNS public.agency_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  shift_row public.agency_shifts%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO shift_row FROM public.agency_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;
  IF NOT public.can_manage_shift_catalog(shift_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage shifts';
  END IF;

  UPDATE public.agency_shifts
  SET
    is_active = COALESCE(p_is_active, false),
    updated_at = now()
  WHERE id = p_shift_id
  RETURNING * INTO shift_row;

  RETURN shift_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs: assignments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_personnel_to_shift(
  p_agency_id uuid,
  p_shift_id uuid,
  p_user_id uuid,
  p_assignment_type text DEFAULT 'primary',
  p_effective_start date DEFAULT NULL,
  p_effective_end date DEFAULT NULL
)
RETURNS public.personnel_shift_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned_type text := lower(btrim(COALESCE(p_assignment_type, 'primary')));
  shift_row public.agency_shifts%ROWTYPE;
  member_status public.membership_status;
  assignment_row public.personnel_shift_assignments%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_agency_id IS NULL OR p_shift_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Agency, shift, and member are required';
  END IF;
  IF cleaned_type NOT IN ('primary', 'secondary', 'temporary') THEN
    RAISE EXCEPTION 'Invalid assignment type';
  END IF;
  IF me = p_user_id AND NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'You cannot assign yourself to a shift';
  END IF;
  IF NOT public.can_manage_shift_assignments(p_agency_id, p_shift_id) THEN
    RAISE EXCEPTION 'Not authorized to manage assignments for this shift';
  END IF;

  SELECT * INTO shift_row
  FROM public.agency_shifts
  WHERE id = p_shift_id
    AND agency_id = p_agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found for this agency';
  END IF;
  IF shift_row.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot assign personnel to an inactive shift';
  END IF;

  SELECT m.status
  INTO member_status
  FROM public.agency_members m
  WHERE m.agency_id = p_agency_id
    AND m.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in this agency';
  END IF;
  IF member_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only active personnel can be assigned to shifts';
  END IF;

  IF cleaned_type = 'primary' THEN
    UPDATE public.personnel_shift_assignments
    SET
      is_active = false,
      updated_at = now()
    WHERE agency_id = p_agency_id
      AND user_id = p_user_id
      AND assignment_type = 'primary'
      AND is_active = true;
  END IF;

  -- Reactivate existing active row for same shift/user if present.
  SELECT *
  INTO assignment_row
  FROM public.personnel_shift_assignments
  WHERE agency_id = p_agency_id
    AND shift_id = p_shift_id
    AND user_id = p_user_id
    AND is_active = true
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.personnel_shift_assignments
    SET
      assignment_type = cleaned_type,
      effective_start = p_effective_start,
      effective_end = p_effective_end,
      assigned_by = me,
      updated_at = now()
    WHERE id = assignment_row.id
    RETURNING * INTO assignment_row;
  ELSE
    INSERT INTO public.personnel_shift_assignments (
      agency_id,
      shift_id,
      user_id,
      assignment_type,
      effective_start,
      effective_end,
      assigned_by
    )
    VALUES (
      p_agency_id,
      p_shift_id,
      p_user_id,
      cleaned_type,
      p_effective_start,
      p_effective_end,
      me
    )
    RETURNING * INTO assignment_row;
  END IF;

  PERFORM public.sync_member_legacy_shift_name(p_agency_id, p_user_id);
  RETURN assignment_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_personnel_shift_assignment(
  p_assignment_id uuid
)
RETURNS public.personnel_shift_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  assignment_row public.personnel_shift_assignments%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO assignment_row
  FROM public.personnel_shift_assignments
  WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF me = assignment_row.user_id AND NOT public.can_manage_personnel(assignment_row.agency_id) THEN
    RAISE EXCEPTION 'You cannot remove your own shift assignment';
  END IF;
  IF NOT public.can_manage_shift_assignments(assignment_row.agency_id, assignment_row.shift_id) THEN
    RAISE EXCEPTION 'Not authorized to manage assignments for this shift';
  END IF;

  UPDATE public.personnel_shift_assignments
  SET
    is_active = false,
    updated_at = now()
  WHERE id = p_assignment_id
  RETURNING * INTO assignment_row;

  PERFORM public.sync_member_legacy_shift_name(assignment_row.agency_id, assignment_row.user_id);
  RETURN assignment_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs: shift supervisors
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_shift_supervisor(
  p_agency_id uuid,
  p_shift_id uuid,
  p_user_id uuid,
  p_is_primary boolean DEFAULT false
)
RETURNS public.shift_supervisors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  member_status public.membership_status;
  supervisor_row public.shift_supervisors%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may assign shift supervisors';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_shifts
    WHERE id = p_shift_id AND agency_id = p_agency_id
  ) THEN
    RAISE EXCEPTION 'Shift not found for this agency';
  END IF;

  SELECT m.status
  INTO member_status
  FROM public.agency_members m
  WHERE m.agency_id = p_agency_id
    AND m.user_id = p_user_id;
  IF NOT FOUND OR member_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Supervisor must be an active member of the same agency';
  END IF;

  IF p_is_primary THEN
    UPDATE public.shift_supervisors
    SET is_primary = false
    WHERE agency_id = p_agency_id
      AND shift_id = p_shift_id
      AND is_primary = true;
  END IF;

  INSERT INTO public.shift_supervisors (agency_id, shift_id, user_id, is_primary)
  VALUES (p_agency_id, p_shift_id, p_user_id, COALESCE(p_is_primary, false))
  ON CONFLICT (shift_id, user_id) DO UPDATE
  SET is_primary = EXCLUDED.is_primary
  RETURNING * INTO supervisor_row;

  RETURN supervisor_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_shift_supervisor(
  p_supervisor_id uuid
)
RETURNS public.shift_supervisors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  supervisor_row public.shift_supervisors%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO supervisor_row
  FROM public.shift_supervisors
  WHERE id = p_supervisor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift supervisor not found';
  END IF;
  IF NOT public.can_manage_personnel(supervisor_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may remove shift supervisors';
  END IF;

  DELETE FROM public.shift_supervisors
  WHERE id = p_supervisor_id
  RETURNING * INTO supervisor_row;

  RETURN supervisor_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_supervisors ENABLE ROW LEVEL SECURITY;

-- Mutations go through SECURITY DEFINER RPCs only (no INSERT/UPDATE/DELETE policies).

DROP POLICY IF EXISTS agency_shifts_select_members ON public.agency_shifts;
CREATE POLICY agency_shifts_select_members
  ON public.agency_shifts
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_agency_member(agency_id)
    AND (
      is_active = true
      OR public.can_manage_personnel(agency_id)
    )
  );

DROP POLICY IF EXISTS personnel_shift_assignments_select ON public.personnel_shift_assignments;
CREATE POLICY personnel_shift_assignments_select
  ON public.personnel_shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_agency_member(agency_id)
    AND (
      is_active = true
      OR public.can_manage_personnel(agency_id)
      OR public.can_manage_shift_assignments(agency_id, shift_id)
      OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS shift_supervisors_select ON public.shift_supervisors;
CREATE POLICY shift_supervisors_select
  ON public.shift_supervisors
  FOR SELECT
  TO authenticated
  USING (public.is_active_agency_member(agency_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.is_shift_supervisor(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_shift_catalog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_shift_assignments(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_member_legacy_shift_name(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agency_shift(uuid, text, text, text, time, time, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_agency_shift(uuid, text, text, boolean, text, boolean, time, boolean, time, boolean, text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agency_shift_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_personnel_to_shift(uuid, uuid, uuid, text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_personnel_shift_assignment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_shift_supervisor(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_shift_supervisor(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_shift_supervisor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_shift_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_shift_assignments(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agency_shift(uuid, text, text, text, time, time, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_shift(uuid, text, text, boolean, text, boolean, time, boolean, time, boolean, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agency_shift_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_personnel_to_shift(uuid, uuid, uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_personnel_shift_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_shift_supervisor(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_shift_supervisor(uuid) TO authenticated;

-- sync helper is internal; keep revoke (no grant to authenticated).

COMMIT;
