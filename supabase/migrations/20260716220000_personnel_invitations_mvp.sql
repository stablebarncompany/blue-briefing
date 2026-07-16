-- Blue Briefing: Personnel management & agency invitations MVP
-- Invite tokens stored hashed; membership mutations via secure functions only.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Invites table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.agency_role NOT NULL,
  unit text,
  title text,
  badge_number text,
  invited_by uuid NOT NULL REFERENCES auth.users (id),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_invites_email_not_blank CHECK (length(btrim(email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_invites_pending_agency_email_uidx
  ON public.agency_invites (agency_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agency_invites_agency_id_idx
  ON public.agency_invites (agency_id);

CREATE INDEX IF NOT EXISTS agency_invites_email_lower_idx
  ON public.agency_invites (lower(email));

CREATE INDEX IF NOT EXISTS agency_invites_status_idx
  ON public.agency_invites (status);

CREATE INDEX IF NOT EXISTS agency_invites_expires_at_idx
  ON public.agency_invites (expires_at);

CREATE INDEX IF NOT EXISTS agency_invites_invited_by_idx
  ON public.agency_invites (invited_by);

DROP TRIGGER IF EXISTS agency_invites_set_updated_at ON public.agency_invites;
CREATE TRIGGER agency_invites_set_updated_at
  BEFORE UPDATE ON public.agency_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_invite_email(raw_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(COALESCE(raw_email, '')));
$$;

CREATE OR REPLACE FUNCTION public.hash_invite_token(raw_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_personnel(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_agency_role(
    target_agency_id,
    ARRAY['agency_admin', 'command_staff']::public.agency_role[]
  );
$$;

CREATE OR REPLACE FUNCTION public.count_active_agency_admins(target_agency_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.agency_members m
  WHERE m.agency_id = target_agency_id
    AND m.status = 'active'
    AND m.role = 'agency_admin';
$$;

CREATE OR REPLACE FUNCTION public.caller_is_agency_admin(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_agency_role(
    target_agency_id,
    ARRAY['agency_admin']::public.agency_role[]
  );
$$;

REVOKE ALL ON FUNCTION public.normalize_invite_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_invite_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_personnel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_active_agency_admins(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caller_is_agency_admin(uuid) FROM PUBLIC;

-- hash_invite_token is only for SECURITY DEFINER invite functions (not clients).
GRANT EXECUTE ON FUNCTION public.normalize_invite_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_personnel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_agency_admins(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_agency_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Invite functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_agency_invite(
  p_agency_id uuid,
  p_email text,
  p_role public.agency_role,
  p_unit text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_badge_number text DEFAULT NULL,
  p_expires_in_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me uuid := auth.uid();
  normalized_email text;
  plain_token text;
  hashed text;
  invite_row public.agency_invites%ROWTYPE;
  expires_days integer := GREATEST(1, LEAST(COALESCE(p_expires_in_days, 7), 30));
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;

  IF NOT public.can_manage_personnel(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may create invitations';
  END IF;

  IF p_role = 'agency_admin' AND NOT public.caller_is_agency_admin(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins may invite another agency admin';
  END IF;

  normalized_email := public.normalize_invite_email(p_email);
  IF normalized_email = '' OR position('@' IN normalized_email) = 0 THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_members m
    INNER JOIN public.profiles p ON p.id = m.user_id
    WHERE m.agency_id = p_agency_id
      AND m.status = 'active'
      AND public.normalize_invite_email(p.email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'That email already belongs to an active agency member';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_invites i
    WHERE i.agency_id = p_agency_id
      AND i.status = 'pending'
      AND lower(i.email) = normalized_email
      AND i.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists for that email';
  END IF;

  -- Expire stale pending invites for this email/agency
  UPDATE public.agency_invites
  SET status = 'expired',
      updated_at = now()
  WHERE agency_id = p_agency_id
    AND status = 'pending'
    AND lower(email) = normalized_email
    AND expires_at <= now();

  plain_token := encode(gen_random_bytes(32), 'hex');
  hashed := public.hash_invite_token(plain_token);

  INSERT INTO public.agency_invites (
    agency_id,
    email,
    role,
    unit,
    title,
    badge_number,
    invited_by,
    token_hash,
    status,
    expires_at
  )
  VALUES (
    p_agency_id,
    normalized_email,
    p_role,
    NULLIF(btrim(COALESCE(p_unit, '')), ''),
    NULLIF(btrim(COALESCE(p_title, '')), ''),
    NULLIF(btrim(COALESCE(p_badge_number, '')), ''),
    me,
    hashed,
    'pending',
    now() + make_interval(days => expires_days)
  )
  RETURNING * INTO invite_row;

  RETURN jsonb_build_object(
    'id', invite_row.id,
    'agency_id', invite_row.agency_id,
    'email', invite_row.email,
    'role', invite_row.role,
    'unit', invite_row.unit,
    'title', invite_row.title,
    'badge_number', invite_row.badge_number,
    'status', invite_row.status,
    'expires_at', invite_row.expires_at,
    'created_at', invite_row.created_at,
    'invite_token', plain_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_agency_invite(invite_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me uuid := auth.uid();
  user_email text;
  hashed text;
  invite_row public.agency_invites%ROWTYPE;
  member_row public.agency_members%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF invite_token IS NULL OR btrim(invite_token) = '' THEN
    RAISE EXCEPTION 'Invitation token is required';
  END IF;

  SELECT u.email
  INTO user_email
  FROM auth.users u
  WHERE u.id = me;

  IF user_email IS NULL OR btrim(user_email) = '' THEN
    RAISE EXCEPTION 'Your account email is required to accept an invitation';
  END IF;

  hashed := public.hash_invite_token(btrim(invite_token));

  SELECT *
  INTO invite_row
  FROM public.agency_invites i
  WHERE i.token_hash = hashed
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation';
  END IF;

  IF invite_row.status = 'accepted'
     AND invite_row.accepted_by = me THEN
    SELECT * INTO member_row
    FROM public.agency_members m
    WHERE m.agency_id = invite_row.agency_id
      AND m.user_id = me;

    RETURN jsonb_build_object(
      'status', 'already_accepted',
      'agency_id', invite_row.agency_id,
      'membership_id', member_row.id
    );
  END IF;

  IF invite_row.status = 'revoked' THEN
    RAISE EXCEPTION 'This invitation has been revoked';
  END IF;

  IF invite_row.status = 'expired' OR invite_row.expires_at <= now() THEN
    UPDATE public.agency_invites
    SET status = 'expired',
        updated_at = now()
    WHERE id = invite_row.id
      AND status = 'pending';
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  IF invite_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer pending';
  END IF;

  IF public.normalize_invite_email(user_email) <> lower(invite_row.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match this invitation';
  END IF;

  INSERT INTO public.agency_members (
    agency_id,
    user_id,
    role,
    status,
    unit,
    title,
    badge_number,
    joined_at
  )
  VALUES (
    invite_row.agency_id,
    me,
    invite_row.role,
    'active',
    invite_row.unit,
    invite_row.title,
    invite_row.badge_number,
    now()
  )
  ON CONFLICT (agency_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    status = 'active',
    unit = EXCLUDED.unit,
    title = EXCLUDED.title,
    badge_number = EXCLUDED.badge_number,
    joined_at = COALESCE(public.agency_members.joined_at, now()),
    updated_at = now()
  RETURNING * INTO member_row;

  UPDATE public.profiles
  SET email = public.normalize_invite_email(user_email),
      updated_at = now()
  WHERE id = me
    AND (email IS NULL OR btrim(email) = '');

  UPDATE public.agency_invites
  SET status = 'accepted',
      accepted_by = me,
      accepted_at = now(),
      updated_at = now()
  WHERE id = invite_row.id;

  RETURN jsonb_build_object(
    'status', 'accepted',
    'agency_id', invite_row.agency_id,
    'membership_id', member_row.id,
    'role', member_row.role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_agency_invite(invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  invite_row public.agency_invites%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO invite_row
  FROM public.agency_invites i
  WHERE i.id = invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF NOT public.can_manage_personnel(invite_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may revoke invitations';
  END IF;

  IF invite_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending invitations can be revoked';
  END IF;

  UPDATE public.agency_invites
  SET status = 'revoked',
      updated_at = now()
  WHERE id = invite_row.id
  RETURNING * INTO invite_row;

  RETURN jsonb_build_object(
    'id', invite_row.id,
    'status', invite_row.status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Membership management functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_agency_membership(
  p_membership_id uuid,
  p_role public.agency_role DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_badge_number text DEFAULT NULL
)
RETURNS public.agency_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  member_row public.agency_members%ROWTYPE;
  next_role public.agency_role;
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
    RAISE EXCEPTION 'Only agency admins or command staff may update memberships';
  END IF;

  next_role := COALESCE(p_role, member_row.role);

  IF member_row.user_id = me AND next_role IS DISTINCT FROM member_row.role THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  IF next_role = 'agency_admin'
     AND next_role IS DISTINCT FROM member_row.role
     AND NOT public.caller_is_agency_admin(member_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins may assign the agency admin role';
  END IF;

  IF member_row.role = 'agency_admin'
     AND next_role IS DISTINCT FROM 'agency_admin'
     AND member_row.status = 'active'
     AND public.count_active_agency_admins(member_row.agency_id) <= 1 THEN
    RAISE EXCEPTION 'Cannot demote the final active agency admin';
  END IF;

  UPDATE public.agency_members
  SET
    role = next_role,
    unit = CASE WHEN p_unit IS NULL THEN unit ELSE NULLIF(btrim(p_unit), '') END,
    title = CASE WHEN p_title IS NULL THEN title ELSE NULLIF(btrim(p_title), '') END,
    badge_number = CASE
      WHEN p_badge_number IS NULL THEN badge_number
      ELSE NULLIF(btrim(p_badge_number), '')
    END,
    updated_at = now()
  WHERE id = member_row.id
  RETURNING * INTO member_row;

  RETURN member_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agency_membership_status(
  p_membership_id uuid,
  p_status public.membership_status
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

  IF p_status NOT IN ('active', 'suspended', 'removed') THEN
    RAISE EXCEPTION 'Unsupported membership status';
  END IF;

  SELECT * INTO member_row
  FROM public.agency_members m
  WHERE m.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  IF NOT public.can_manage_personnel(member_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may change membership status';
  END IF;

  IF member_row.user_id = me AND p_status IN ('suspended', 'removed') THEN
    RAISE EXCEPTION 'You cannot suspend or remove your own membership';
  END IF;

  IF member_row.role = 'agency_admin'
     AND member_row.status = 'active'
     AND p_status IN ('suspended', 'removed')
     AND public.count_active_agency_admins(member_row.agency_id) <= 1 THEN
    RAISE EXCEPTION 'Cannot suspend or remove the final active agency admin';
  END IF;

  UPDATE public.agency_members
  SET
    status = p_status,
    joined_at = CASE
      WHEN p_status = 'active' THEN COALESCE(joined_at, now())
      ELSE joined_at
    END,
    updated_at = now()
  WHERE id = member_row.id
  RETURNING * INTO member_row;

  RETURN member_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agency_invite(uuid, text, public.agency_role, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_agency_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_agency_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_agency_membership(uuid, public.agency_role, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agency_membership_status(uuid, public.membership_status) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_agency_invite(uuid, text, public.agency_role, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_agency_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_agency_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_membership(uuid, public.agency_role, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agency_membership_status(uuid, public.membership_status) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_invites ENABLE ROW LEVEL SECURITY;

-- Admins/command may view invites for their agency.
DROP POLICY IF EXISTS agency_invites_select_managers ON public.agency_invites;
CREATE POLICY agency_invites_select_managers
  ON public.agency_invites
  FOR SELECT
  TO authenticated
  USING (public.can_manage_personnel(agency_id));

-- No INSERT/UPDATE/DELETE policies for clients — functions only.

-- Hide token_hash from direct client selects (SECURITY DEFINER functions still see full rows).
REVOKE ALL ON TABLE public.agency_invites FROM PUBLIC;
REVOKE ALL ON TABLE public.agency_invites FROM anon;
REVOKE ALL ON TABLE public.agency_invites FROM authenticated;
GRANT SELECT (
  id,
  agency_id,
  email,
  role,
  unit,
  title,
  badge_number,
  invited_by,
  status,
  expires_at,
  accepted_by,
  accepted_at,
  created_at,
  updated_at
) ON public.agency_invites TO authenticated;

-- Personnel managers may view all membership rows in their agency (including suspended/removed)
DROP POLICY IF EXISTS agency_members_select_personnel_managers ON public.agency_members;
CREATE POLICY agency_members_select_personnel_managers
  ON public.agency_members
  FOR SELECT
  TO authenticated
  USING (public.can_manage_personnel(agency_id));

-- Managers may read profiles for members of agencies they administer (incl. suspended/removed)
DROP POLICY IF EXISTS profiles_select_personnel_managers ON public.profiles;
CREATE POLICY profiles_select_personnel_managers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agency_members m
      WHERE m.user_id = profiles.id
        AND public.can_manage_personnel(m.agency_id)
    )
  );

COMMIT;
