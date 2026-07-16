-- Fix agency_invites client access and add safe list helpers.
-- PostgREST rejected column-only GRANTs with "permission denied for table agency_invites".
-- Prefer SECURITY DEFINER list functions; keep table locked down for authenticated.

BEGIN;

-- ---------------------------------------------------------------------------
-- Safe invite listing (no token_hash)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_agency_invites(p_agency_id uuid)
RETURNS TABLE (
  id uuid,
  agency_id uuid,
  email text,
  role public.agency_role,
  unit text,
  title text,
  badge_number text,
  invited_by uuid,
  status text,
  expires_at timestamptz,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;

  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may view invitations';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.agency_id,
    i.email,
    i.role,
    i.unit,
    i.title,
    i.badge_number,
    i.invited_by,
    i.status,
    i.expires_at,
    i.accepted_by,
    i.accepted_at,
    i.created_at,
    i.updated_at
  FROM public.agency_invites i
  WHERE i.agency_id = p_agency_id
  ORDER BY i.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_agency_invites(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_agency_invites(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Group membership counts for personnel managers (agency-scoped)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_personnel_group_counts(p_agency_id uuid)
RETURNS TABLE (
  user_id uuid,
  group_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;

  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may view personnel group counts';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    count(*)::integer AS group_count
  FROM public.group_members gm
  INNER JOIN public.groups g ON g.id = gm.group_id
  WHERE gm.agency_id = p_agency_id
    AND g.agency_id = p_agency_id
    AND COALESCE(g.is_archived, false) = false
  GROUP BY gm.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_personnel_group_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_personnel_group_counts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_member_groups(p_agency_id uuid, p_user_id uuid)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  is_moderator boolean,
  is_archived boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may view member groups';
  END IF;

  RETURN QUERY
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    gm.is_moderator,
    g.is_archived
  FROM public.group_members gm
  INNER JOIN public.groups g ON g.id = gm.group_id
  WHERE gm.agency_id = p_agency_id
    AND gm.user_id = p_user_id
    AND g.agency_id = p_agency_id
  ORDER BY g.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_member_groups(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_member_groups(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_agency_groups_for_personnel(p_agency_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  is_archived boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may list agency groups for personnel';
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, g.is_archived
  FROM public.groups g
  WHERE g.agency_id = p_agency_id
    AND COALESCE(g.is_archived, false) = false
  ORDER BY g.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_agency_groups_for_personnel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_agency_groups_for_personnel(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Keep table locked; authenticated clients use list_agency_invites RPC.
-- Ensure no residual table SELECT that exposes token_hash.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.agency_invites FROM PUBLIC;
REVOKE ALL ON TABLE public.agency_invites FROM anon;
REVOKE ALL ON TABLE public.agency_invites FROM authenticated;

COMMIT;
