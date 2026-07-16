-- Blue Briefing: Groups MVP (invite-only agency channels)
-- Agency-scoped groups, membership, posts, and replies with non-recursive RLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  is_private boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT groups_agency_name_unique UNIQUE (agency_id, name)
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  is_moderator boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_unique_member UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id),
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_posts_body_not_blank CHECK (length(btrim(body)) > 0)
);

CREATE TABLE IF NOT EXISTS public.group_post_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.group_posts (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_post_replies_body_not_blank CHECK (length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS groups_agency_id_idx ON public.groups (agency_id);
CREATE INDEX IF NOT EXISTS groups_created_at_desc_idx ON public.groups (created_at DESC);
CREATE INDEX IF NOT EXISTS groups_agency_archived_idx ON public.groups (agency_id, is_archived);

CREATE INDEX IF NOT EXISTS group_members_group_id_idx ON public.group_members (group_id);
CREATE INDEX IF NOT EXISTS group_members_agency_id_idx ON public.group_members (agency_id);
CREATE INDEX IF NOT EXISTS group_members_user_id_idx ON public.group_members (user_id);

CREATE INDEX IF NOT EXISTS group_posts_group_id_idx ON public.group_posts (group_id);
CREATE INDEX IF NOT EXISTS group_posts_agency_id_idx ON public.group_posts (agency_id);
CREATE INDEX IF NOT EXISTS group_posts_created_at_desc_idx ON public.group_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS group_posts_group_pinned_created_idx
  ON public.group_posts (group_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS group_post_replies_post_id_idx ON public.group_post_replies (post_id);
CREATE INDEX IF NOT EXISTS group_post_replies_agency_id_idx ON public.group_post_replies (agency_id);
CREATE INDEX IF NOT EXISTS group_post_replies_created_at_idx ON public.group_post_replies (created_at);

DROP TRIGGER IF EXISTS groups_set_updated_at ON public.groups;
CREATE TRIGGER groups_set_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS group_posts_set_updated_at ON public.group_posts;
CREATE TRIGGER group_posts_set_updated_at
  BEFORE UPDATE ON public.group_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS group_post_replies_set_updated_at ON public.group_post_replies;
CREATE TRIGGER group_post_replies_set_updated_at
  BEFORE UPDATE ON public.group_post_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, fixed search_path — avoid recursive RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_member_of_agency(
  target_user_id uuid,
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
    FROM public.agency_members m
    WHERE m.user_id = target_user_id
      AND m.agency_id = target_agency_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.group_belongs_to_agency(
  target_group_id uuid,
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
    FROM public.groups g
    WHERE g.id = target_group_id
      AND g.agency_id = target_agency_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = target_group_id
      AND gm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_moderator(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = target_group_id
      AND gm.user_id = auth.uid()
      AND gm.is_moderator = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_group_members(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_group_moderator(target_group_id)
    OR public.has_agency_role(
      (SELECT g.agency_id FROM public.groups g WHERE g.id = target_group_id),
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    );
$$;

CREATE OR REPLACE FUNCTION public.can_update_group(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = target_group_id
      AND (
        g.created_by = auth.uid()
        OR public.is_group_moderator(target_group_id)
        OR public.has_agency_role(
          g.agency_id,
          ARRAY['command_staff', 'agency_admin']::public.agency_role[]
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_group_content(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_group_moderator(target_group_id)
    OR public.has_agency_role(
      (SELECT g.agency_id FROM public.groups g WHERE g.id = target_group_id),
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    );
$$;

CREATE OR REPLACE FUNCTION public.group_post_group_id(target_post_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.group_id
  FROM public.group_posts p
  WHERE p.id = target_post_id;
$$;

-- Auto-add creator as moderator member (bypasses RLS; enforces invite model)
CREATE OR REPLACE FUNCTION public.handle_group_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, agency_id, user_id, is_moderator)
  VALUES (NEW.id, NEW.agency_id, NEW.created_by, true)
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS groups_after_insert_add_creator ON public.groups;
CREATE TRIGGER groups_after_insert_add_creator
  AFTER INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_created();

-- Only admins/command may change archive flag
CREATE OR REPLACE FUNCTION public.protect_group_archive_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    IF NOT public.has_agency_role(
      NEW.agency_id,
      ARRAY['agency_admin', 'command_staff']::public.agency_role[]
    ) THEN
      RAISE EXCEPTION 'Only agency admins or command staff may archive or unarchive groups';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS groups_protect_archive ON public.groups;
CREATE TRIGGER groups_protect_archive
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_group_archive_flag();

REVOKE ALL ON FUNCTION public.is_active_member_of_agency(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_belongs_to_agency(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_moderator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_group_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_update_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_moderate_group_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_post_group_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_group_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_group_archive_flag() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_active_member_of_agency(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_belongs_to_agency(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_moderator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_group_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_update_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate_group_content(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_post_group_id(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_replies ENABLE ROW LEVEL SECURITY;

-- Groups: members may view groups they belong to
DROP POLICY IF EXISTS groups_select_member ON public.groups;
CREATE POLICY groups_select_member
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(id));

-- Groups: supervisory roles may create for their agency
DROP POLICY IF EXISTS groups_insert_supervisory ON public.groups;
CREATE POLICY groups_insert_supervisory
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_active_agency_member(agency_id)
    AND public.has_agency_role(
      agency_id,
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    )
  );

-- Groups: creators, moderators, admin/command may update details
DROP POLICY IF EXISTS groups_update_managers ON public.groups;
CREATE POLICY groups_update_managers
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (public.can_update_group(id))
  WITH CHECK (
    public.can_update_group(id)
    AND public.is_active_agency_member(agency_id)
  );

-- Groups: admin/command delete
DROP POLICY IF EXISTS groups_delete_command ON public.groups;
CREATE POLICY groups_delete_command
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (
    public.has_agency_role(
      agency_id,
      ARRAY['agency_admin', 'command_staff']::public.agency_role[]
    )
  );

-- Group members: view only for groups the user belongs to
DROP POLICY IF EXISTS group_members_select_fellow ON public.group_members;
CREATE POLICY group_members_select_fellow
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

-- Group members: managers may add active same-agency personnel (no self-join for normals)
DROP POLICY IF EXISTS group_members_insert_managers ON public.group_members;
CREATE POLICY group_members_insert_managers
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_group_members(group_id)
    AND public.group_belongs_to_agency(group_id, agency_id)
    AND public.is_active_agency_member(agency_id)
    AND public.is_active_member_of_agency(user_id, agency_id)
  );

-- Group members: managers may update moderator flag / keep agency intact
DROP POLICY IF EXISTS group_members_update_managers ON public.group_members;
CREATE POLICY group_members_update_managers
  ON public.group_members
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_group_members(group_id))
  WITH CHECK (
    public.can_manage_group_members(group_id)
    AND public.group_belongs_to_agency(group_id, agency_id)
    AND public.is_active_member_of_agency(user_id, agency_id)
  );

-- Group members: managers may remove members
DROP POLICY IF EXISTS group_members_delete_managers ON public.group_members;
CREATE POLICY group_members_delete_managers
  ON public.group_members
  FOR DELETE
  TO authenticated
  USING (public.can_manage_group_members(group_id));

-- Posts: members view/create
DROP POLICY IF EXISTS group_posts_select_member ON public.group_posts;
CREATE POLICY group_posts_select_member
  ON public.group_posts
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS group_posts_insert_member ON public.group_posts;
CREATE POLICY group_posts_insert_member
  ON public.group_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_group_member(group_id)
    AND public.group_belongs_to_agency(group_id, agency_id)
  );

DROP POLICY IF EXISTS group_posts_update_author_or_mod ON public.group_posts;
CREATE POLICY group_posts_update_author_or_mod
  ON public.group_posts
  FOR UPDATE
  TO authenticated
  USING (
    public.is_group_member(group_id)
    AND (
      author_id = auth.uid()
      OR public.can_moderate_group_content(group_id)
    )
  )
  WITH CHECK (
    public.is_group_member(group_id)
    AND public.group_belongs_to_agency(group_id, agency_id)
    AND (
      author_id = auth.uid()
      OR public.can_moderate_group_content(group_id)
    )
  );

DROP POLICY IF EXISTS group_posts_delete_author_or_mod ON public.group_posts;
CREATE POLICY group_posts_delete_author_or_mod
  ON public.group_posts
  FOR DELETE
  TO authenticated
  USING (
    public.is_group_member(group_id)
    AND (
      author_id = auth.uid()
      OR public.is_group_moderator(group_id)
      OR public.has_agency_role(
        agency_id,
        ARRAY['agency_admin', 'command_staff']::public.agency_role[]
      )
    )
  );

-- Replies
DROP POLICY IF EXISTS group_post_replies_select_member ON public.group_post_replies;
CREATE POLICY group_post_replies_select_member
  ON public.group_post_replies
  FOR SELECT
  TO authenticated
  USING (
    public.is_group_member(public.group_post_group_id(post_id))
  );

DROP POLICY IF EXISTS group_post_replies_insert_member ON public.group_post_replies;
CREATE POLICY group_post_replies_insert_member
  ON public.group_post_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_group_member(public.group_post_group_id(post_id))
    AND EXISTS (
      SELECT 1
      FROM public.group_posts p
      WHERE p.id = post_id
        AND p.agency_id = agency_id
    )
  );

DROP POLICY IF EXISTS group_post_replies_update_author ON public.group_post_replies;
CREATE POLICY group_post_replies_update_author
  ON public.group_post_replies
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    AND public.is_group_member(public.group_post_group_id(post_id))
  )
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_group_member(public.group_post_group_id(post_id))
  );

DROP POLICY IF EXISTS group_post_replies_delete_author_or_mod ON public.group_post_replies;
CREATE POLICY group_post_replies_delete_author_or_mod
  ON public.group_post_replies
  FOR DELETE
  TO authenticated
  USING (
    public.is_group_member(public.group_post_group_id(post_id))
    AND (
      author_id = auth.uid()
      OR public.can_moderate_group_content(public.group_post_group_id(post_id))
    )
  );

COMMIT;
