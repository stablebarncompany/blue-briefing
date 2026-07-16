-- Agency-configurable unit/division names.
-- Authorization remains on agency_role; units are organizational labels only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_units_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_units_agency_name_normalized_uidx
  ON public.agency_units (agency_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS agency_units_agency_id_idx
  ON public.agency_units (agency_id);

CREATE INDEX IF NOT EXISTS agency_units_agency_active_idx
  ON public.agency_units (agency_id, is_active);

DROP TRIGGER IF EXISTS agency_units_set_updated_at ON public.agency_units;
CREATE TRIGGER agency_units_set_updated_at
  BEFORE UPDATE ON public.agency_units
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agency_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_units_select_members ON public.agency_units;
CREATE POLICY agency_units_select_members
  ON public.agency_units
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_agency_member(agency_id)
    AND (
      is_active = true
      OR public.can_manage_personnel(agency_id)
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_agency_unit(
  p_agency_id uuid,
  p_name text
)
RETURNS public.agency_units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := NULLIF(btrim(COALESCE(p_name, '')), '');
  unit_row public.agency_units%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;

  IF cleaned IS NULL THEN
    RAISE EXCEPTION 'Unit name is required';
  END IF;

  IF lower(cleaned) = 'other' THEN
    RAISE EXCEPTION 'Enter a specific unit name instead of Other';
  END IF;

  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage units';
  END IF;

  SELECT *
  INTO unit_row
  FROM public.agency_units u
  WHERE u.agency_id = p_agency_id
    AND lower(btrim(u.name)) = lower(cleaned)
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.agency_units
    SET
      name = cleaned,
      is_active = true,
      updated_at = now()
    WHERE id = unit_row.id
    RETURNING * INTO unit_row;
    RETURN unit_row;
  END IF;

  INSERT INTO public.agency_units (agency_id, name, created_by)
  VALUES (p_agency_id, cleaned, me)
  RETURNING * INTO unit_row;

  RETURN unit_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agency_unit_active(
  p_unit_id uuid,
  p_is_active boolean
)
RETURNS public.agency_units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  unit_row public.agency_units%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO unit_row
  FROM public.agency_units u
  WHERE u.id = p_unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  IF NOT public.can_manage_personnel(unit_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage units';
  END IF;

  UPDATE public.agency_units
  SET is_active = COALESCE(p_is_active, true),
      updated_at = now()
  WHERE id = unit_row.id
  RETURNING * INTO unit_row;

  RETURN unit_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_agency_unit(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agency_unit_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_agency_unit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agency_unit_active(uuid, boolean) TO authenticated;

-- Direct client reads; writes go through SECURITY DEFINER helpers only.
REVOKE ALL ON TABLE public.agency_units FROM PUBLIC;
REVOKE ALL ON TABLE public.agency_units FROM anon;
GRANT SELECT ON TABLE public.agency_units TO authenticated;

COMMIT;
