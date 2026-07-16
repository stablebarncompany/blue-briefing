-- In-app notifications MVP (agency-scoped, recipient-only).
-- Creation via SECURITY DEFINER helpers + triggers. No arbitrary client inserts.
-- Do not apply from the Expo client.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enum + table
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'critical_briefing',
    'briefing_created',
    'briefing_updated',
    'briefing_ack_required',
    'group_post',
    'group_reply',
    'group_mention',
    'direct_message',
    'agency_invitation',
    'membership_updated',
    'membership_suspended',
    'membership_reactivated',
    'access_removed',
    'system'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES public.agencies (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  route text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT notifications_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_id_idx
  ON public.notifications (recipient_id);

CREATE INDEX IF NOT EXISTS notifications_agency_id_idx
  ON public.notifications (agency_id);

CREATE INDEX IF NOT EXISTS notifications_is_read_idx
  ON public.notifications (is_read);

CREATE INDEX IF NOT EXISTS notifications_created_at_desc_idx
  ON public.notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_created_idx
  ON public.notifications (recipient_id, is_read, created_at DESC);

-- Prevent duplicate unread rows for the same recipient + type + entity.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_entity_dedupe_uidx
  ON public.notifications (recipient_id, type, entity_id)
  WHERE is_read = false AND entity_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_actor_label(p_actor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p.display_name), ''),
    NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    NULLIF(btrim(p.email), ''),
    'A teammate'
  )
  FROM public.profiles p
  WHERE p.id = p_actor_id;
$$;

CREATE OR REPLACE FUNCTION public.create_in_app_notification(
  p_agency_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_coalesce_unread boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  new_id uuid;
BEGIN
  IF p_recipient_id IS NULL OR cleaned_title IS NULL THEN
    RETURN NULL;
  END IF;

  -- Never notify the actor about their own action.
  IF p_actor_id IS NOT NULL AND p_recipient_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  IF p_coalesce_unread AND p_entity_id IS NOT NULL THEN
    UPDATE public.notifications n
    SET
      title = cleaned_title,
      body = p_body,
      actor_id = p_actor_id,
      agency_id = p_agency_id,
      entity_type = p_entity_type,
      route = p_route,
      is_read = false,
      read_at = NULL,
      created_at = now()
    WHERE n.recipient_id = p_recipient_id
      AND n.type = p_type
      AND n.entity_id = p_entity_id
      AND n.is_read = false
    RETURNING n.id INTO new_id;

    IF new_id IS NOT NULL THEN
      RETURN new_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.notifications (
      agency_id,
      recipient_id,
      actor_id,
      type,
      title,
      body,
      entity_type,
      entity_id,
      route,
      is_read
    )
    VALUES (
      p_agency_id,
      p_recipient_id,
      p_actor_id,
      p_type,
      cleaned_title,
      p_body,
      p_entity_type,
      p_entity_id,
      p_route,
      false
    )
    RETURNING id INTO new_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN NULL;
  END;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_notification_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.route IS DISTINCT FROM OLD.route
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'Only notification read state may be updated';
  END IF;

  IF NEW.is_read AND (NOT OLD.is_read OR NEW.read_at IS NULL) THEN
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;

  IF NOT NEW.is_read THEN
    NEW.read_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_protect_update ON public.notifications;
CREATE TRIGGER notifications_protect_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notification_update();

-- Client-safe mark helpers (recipient-scoped).
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  row_data public.notifications%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.notifications n
  SET is_read = true,
      read_at = now()
  WHERE n.id = p_notification_id
    AND n.recipient_id = me
  RETURNING * INTO row_data;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  RETURN row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  updated_count integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.notifications n
  SET is_read = true,
      read_at = now()
  WHERE n.recipient_id = me
    AND n.is_read = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_own_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.notifications n
  WHERE n.id = p_notification_id
    AND n.recipient_id = me;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Briefing triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_on_briefing_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_id uuid;
  ntype public.notification_type;
  ntitle text;
  nbody text;
  actor_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  actor_label := COALESCE(public.notification_actor_label(NEW.author_id), 'A teammate');

  IF NEW.priority = 'critical' THEN
    ntype := 'critical_briefing';
    ntitle := 'Critical briefing';
    nbody := actor_label || ': ' || NEW.title;
  ELSIF NEW.requires_acknowledgement THEN
    ntype := 'briefing_ack_required';
    ntitle := 'Acknowledgement required';
    nbody := actor_label || ': ' || NEW.title;
  ELSE
    ntype := 'briefing_created';
    ntitle := 'New briefing';
    nbody := actor_label || ': ' || NEW.title;
  END IF;

  FOR member_id IN
    SELECT m.user_id
    FROM public.agency_members m
    WHERE m.agency_id = NEW.agency_id
      AND m.status = 'active'
      AND m.user_id IS DISTINCT FROM NEW.author_id
  LOOP
    PERFORM public.create_in_app_notification(
      NEW.agency_id,
      member_id,
      NEW.author_id,
      ntype,
      ntitle,
      nbody,
      'briefing',
      NEW.id,
      '/briefings/' || NEW.id::text,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS briefings_notify_insert ON public.briefings;
CREATE TRIGGER briefings_notify_insert
  AFTER INSERT ON public.briefings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_briefing_insert();

CREATE OR REPLACE FUNCTION public.notify_on_briefing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_id uuid;
  ntype public.notification_type;
  ntitle text;
  nbody text;
  actor_label text;
  actor uuid := auth.uid();
  should_notify boolean := false;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  IF OLD.priority IS DISTINCT FROM 'critical' AND NEW.priority = 'critical' THEN
    should_notify := true;
    ntype := 'critical_briefing';
    ntitle := 'Critical briefing';
  ELSIF OLD.requires_acknowledgement IS DISTINCT FROM true
        AND NEW.requires_acknowledgement = true THEN
    should_notify := true;
    ntype := 'briefing_ack_required';
    ntitle := 'Acknowledgement required';
  ELSIF NEW.title IS DISTINCT FROM OLD.title
        OR NEW.body IS DISTINCT FROM OLD.body
        OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    should_notify := true;
    ntype := 'briefing_updated';
    ntitle := 'Briefing updated';
  END IF;

  IF NOT should_notify THEN
    RETURN NEW;
  END IF;

  actor_label := COALESCE(public.notification_actor_label(COALESCE(actor, NEW.author_id)), 'A teammate');
  nbody := actor_label || ': ' || NEW.title;

  FOR member_id IN
    SELECT m.user_id
    FROM public.agency_members m
    WHERE m.agency_id = NEW.agency_id
      AND m.status = 'active'
      AND m.user_id IS DISTINCT FROM COALESCE(actor, NEW.author_id)
  LOOP
    PERFORM public.create_in_app_notification(
      NEW.agency_id,
      member_id,
      COALESCE(actor, NEW.author_id),
      ntype,
      ntitle,
      nbody,
      'briefing',
      NEW.id,
      '/briefings/' || NEW.id::text,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS briefings_notify_update ON public.briefings;
CREATE TRIGGER briefings_notify_update
  AFTER UPDATE ON public.briefings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_briefing_update();

-- ---------------------------------------------------------------------------
-- Group post / reply triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_on_group_post_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_id uuid;
  ntype public.notification_type;
  ntitle text;
  nbody text;
  actor_label text;
  group_name text;
  preview text;
BEGIN
  actor_label := COALESCE(public.notification_actor_label(NEW.author_id), 'A teammate');

  SELECT g.name INTO group_name
  FROM public.groups g
  WHERE g.id = NEW.group_id;

  preview := left(btrim(NEW.body), 120);
  IF position('@all' in lower(NEW.body)) > 0 THEN
    ntype := 'group_mention';
    ntitle := 'Mentioned in ' || COALESCE(group_name, 'group');
  ELSE
    ntype := 'group_post';
    ntitle := 'New post in ' || COALESCE(group_name, 'group');
  END IF;

  nbody := actor_label || ': ' || preview;

  FOR member_id IN
    SELECT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = NEW.group_id
      AND gm.user_id IS DISTINCT FROM NEW.author_id
  LOOP
    PERFORM public.create_in_app_notification(
      NEW.agency_id,
      member_id,
      NEW.author_id,
      ntype,
      ntitle,
      nbody,
      'group_post',
      NEW.id,
      '/groups/' || NEW.group_id::text,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_posts_notify_insert ON public.group_posts;
CREATE TRIGGER group_posts_notify_insert
  AFTER INSERT ON public.group_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_group_post_insert();

CREATE OR REPLACE FUNCTION public.notify_on_group_reply_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row public.group_posts%ROWTYPE;
  recipient uuid;
  actor_label text;
  group_name text;
  preview text;
BEGIN
  SELECT * INTO post_row
  FROM public.group_posts p
  WHERE p.id = NEW.post_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  actor_label := COALESCE(public.notification_actor_label(NEW.author_id), 'A teammate');

  SELECT g.name INTO group_name
  FROM public.groups g
  WHERE g.id = post_row.group_id;

  preview := left(btrim(NEW.body), 120);

  FOR recipient IN
    SELECT DISTINCT x.user_id
    FROM (
      SELECT post_row.author_id AS user_id
      UNION
      SELECT r.author_id
      FROM public.group_post_replies r
      WHERE r.post_id = NEW.post_id
        AND r.id IS DISTINCT FROM NEW.id
    ) x
    WHERE x.user_id IS DISTINCT FROM NEW.author_id
  LOOP
    -- Only notify current group members.
    IF EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = post_row.group_id
        AND gm.user_id = recipient
    ) THEN
      PERFORM public.create_in_app_notification(
        NEW.agency_id,
        recipient,
        NEW.author_id,
        'group_reply',
        'Reply in ' || COALESCE(group_name, 'group'),
        actor_label || ': ' || preview,
        'group_post',
        NEW.post_id,
        '/groups/' || post_row.group_id::text,
        true
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_post_replies_notify_insert ON public.group_post_replies;
CREATE TRIGGER group_post_replies_notify_insert
  AFTER INSERT ON public.group_post_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_group_reply_insert();

-- ---------------------------------------------------------------------------
-- Direct message trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_on_direct_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  actor_label text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  actor_label := COALESCE(public.notification_actor_label(NEW.sender_id), 'A teammate');

  FOR recipient IN
    SELECT cm.user_id
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id IS DISTINCT FROM NEW.sender_id
      AND COALESCE(cm.is_muted, false) = false
  LOOP
    PERFORM public.create_in_app_notification(
      NEW.agency_id,
      recipient,
      NEW.sender_id,
      'direct_message',
      'New message from ' || actor_label,
      left(btrim(NEW.body), 120),
      'conversation',
      NEW.conversation_id,
      '/messages/' || NEW.conversation_id::text,
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direct_messages_notify_insert ON public.direct_messages;
CREATE TRIGGER direct_messages_notify_insert
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_direct_message_insert();

-- ---------------------------------------------------------------------------
-- Membership triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_on_agency_member_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  ntype public.notification_type;
  ntitle text;
  nbody text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'suspended' THEN
      ntype := 'membership_suspended';
      ntitle := 'Membership suspended';
      nbody := 'Your agency membership was suspended.';
    ELSIF NEW.status = 'removed' THEN
      ntype := 'access_removed';
      ntitle := 'Agency access removed';
      nbody := 'Your access to this agency was removed.';
    ELSIF NEW.status = 'active' AND OLD.status IN ('suspended', 'removed', 'pending') THEN
      ntype := 'membership_reactivated';
      ntitle := 'Membership reactivated';
      nbody := 'Your agency membership is active again.';
    ELSE
      ntype := NULL;
    END IF;

    IF ntype IS NOT NULL THEN
      PERFORM public.create_in_app_notification(
        NEW.agency_id,
        NEW.user_id,
        actor,
        ntype,
        ntitle,
        nbody,
        'membership',
        NEW.id,
        '/personnel',
        false
      );
    END IF;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role
     OR OLD.unit IS DISTINCT FROM NEW.unit
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.badge_number IS DISTINCT FROM NEW.badge_number
  THEN
    -- Role/profile field changes (status-only updates already handled above).
    IF OLD.role IS DISTINCT FROM NEW.role
       OR (
         OLD.status IS NOT DISTINCT FROM NEW.status
         AND (
           OLD.unit IS DISTINCT FROM NEW.unit
           OR OLD.title IS DISTINCT FROM NEW.title
           OR OLD.badge_number IS DISTINCT FROM NEW.badge_number
         )
       )
    THEN
      PERFORM public.create_in_app_notification(
        NEW.agency_id,
        NEW.user_id,
        actor,
        'membership_updated',
        'Membership updated',
        CASE
          WHEN OLD.role IS DISTINCT FROM NEW.role THEN
            'Your agency role or profile details were updated.'
          ELSE
            'Your agency profile details were updated.'
        END,
        'membership',
        NEW.id,
        '/personnel',
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_members_notify_update ON public.agency_members;
CREATE TRIGGER agency_members_notify_update
  AFTER UPDATE ON public.agency_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_agency_member_update();

-- Invite: notify existing auth user (by profile email) when invited.
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
  invitee_id uuid;
  agency_name text;
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

  SELECT a.name INTO agency_name
  FROM public.agencies a
  WHERE a.id = p_agency_id;

  SELECT p.id INTO invitee_id
  FROM public.profiles p
  WHERE public.normalize_invite_email(p.email) = normalized_email
  LIMIT 1;

  IF invitee_id IS NOT NULL THEN
    PERFORM public.create_in_app_notification(
      p_agency_id,
      invitee_id,
      me,
      'agency_invitation',
      'Agency invitation',
      'You were invited to join ' || COALESCE(agency_name, 'an agency') || '.',
      'invite',
      invite_row.id,
      '/accept-invite',
      true
    );
  END IF;

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

-- ---------------------------------------------------------------------------
-- RLS policies (recipient-only; no admin blanket access)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own_read_state ON public.notifications;
CREATE POLICY notifications_update_own_read_state
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (recipient_id = auth.uid());

-- No INSERT policy for authenticated clients.

REVOKE ALL ON TABLE public.notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications FROM anon;
GRANT SELECT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;

REVOKE ALL ON FUNCTION public.notification_actor_label(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_in_app_notification(uuid, uuid, uuid, public.notification_type, text, text, text, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_notification(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_notification(uuid) TO authenticated;

-- create_in_app_notification intentionally not granted to authenticated.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END
$$;

COMMIT;
