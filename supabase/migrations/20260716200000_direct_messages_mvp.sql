-- Blue Briefing: Direct Messages MVP (agency-scoped one-to-one)
-- Private DMs; no admin blanket-read; no third-member conversations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  -- Deterministic pair key: lower(user_id):higher(user_id) for unique 1:1 per agency
  participant_pair_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CONSTRAINT conversations_pair_key_not_blank CHECK (length(btrim(participant_pair_key)) > 0),
  CONSTRAINT conversations_agency_pair_unique UNIQUE (agency_id, participant_pair_key)
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  CONSTRAINT conversation_members_unique_member UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT direct_messages_body_not_blank CHECK (
    deleted_at IS NOT NULL OR length(btrim(body)) > 0
  )
);

CREATE INDEX IF NOT EXISTS conversation_members_user_id_idx
  ON public.conversation_members (user_id);

CREATE INDEX IF NOT EXISTS conversation_members_conversation_id_idx
  ON public.conversation_members (conversation_id);

CREATE INDEX IF NOT EXISTS conversations_agency_id_idx
  ON public.conversations (agency_id);

CREATE INDEX IF NOT EXISTS conversations_last_message_at_desc_idx
  ON public.conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS direct_messages_conversation_id_idx
  ON public.direct_messages (conversation_id);

CREATE INDEX IF NOT EXISTS direct_messages_created_at_idx
  ON public.direct_messages (created_at);

CREATE INDEX IF NOT EXISTS direct_messages_sender_id_idx
  ON public.direct_messages (sender_id);

CREATE INDEX IF NOT EXISTS direct_messages_conversation_created_idx
  ON public.direct_messages (conversation_id, created_at);

DROP TRIGGER IF EXISTS conversations_set_updated_at ON public.conversations;
CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS direct_messages_set_updated_at ON public.direct_messages;
CREATE TRIGGER direct_messages_set_updated_at
  BEFORE UPDATE ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_conversation_member(target_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = target_conversation_id
      AND cm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.conversation_belongs_to_agency(
  target_conversation_id uuid,
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
    FROM public.conversations c
    WHERE c.id = target_conversation_id
      AND c.agency_id = target_agency_id
  );
$$;

CREATE OR REPLACE FUNCTION public.direct_conversation_pair_key(
  user_a uuid,
  user_b uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN user_a < user_b THEN user_a::text || ':' || user_b::text
    ELSE user_b::text || ':' || user_a::text
  END;
$$;

-- Enforce max 2 members on any insert path (including SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.enforce_direct_conversation_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_count integer;
BEGIN
  SELECT count(*)::integer
  INTO member_count
  FROM public.conversation_members
  WHERE conversation_id = NEW.conversation_id;

  IF member_count >= 2 THEN
    RAISE EXCEPTION 'Direct conversations may contain exactly two members';
  END IF;

  IF NOT public.conversation_belongs_to_agency(NEW.conversation_id, NEW.agency_id) THEN
    RAISE EXCEPTION 'Conversation membership agency mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_members_enforce_limit ON public.conversation_members;
CREATE TRIGGER conversation_members_enforce_limit
  BEFORE INSERT ON public.conversation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_direct_conversation_member_limit();

-- Members may only change their own archive/mute flags
CREATE OR REPLACE FUNCTION public.protect_conversation_member_prefs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'Only archive and mute preferences may be updated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_members_protect_prefs ON public.conversation_members;
CREATE TRIGGER conversation_members_protect_prefs
  BEFORE UPDATE ON public.conversation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_conversation_member_prefs();

CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direct_messages_touch_conversation ON public.direct_messages;
CREATE TRIGGER direct_messages_touch_conversation
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_last_message();

-- Secure conversation start / reopen
CREATE OR REPLACE FUNCTION public.start_direct_conversation(
  target_agency_id uuid,
  other_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  pair_key text;
  existing_id uuid;
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF other_user_id IS NULL THEN
    RAISE EXCEPTION 'Recipient is required';
  END IF;

  IF other_user_id = me THEN
    RAISE EXCEPTION 'You cannot start a conversation with yourself';
  END IF;

  IF target_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;

  IF NOT public.is_active_agency_member(target_agency_id) THEN
    RAISE EXCEPTION 'You are not an active member of this agency';
  END IF;

  IF NOT public.is_active_member_of_agency(other_user_id, target_agency_id) THEN
    RAISE EXCEPTION 'Recipient is not an active member of this agency';
  END IF;

  pair_key := public.direct_conversation_pair_key(me, other_user_id);

  SELECT c.id
  INTO existing_id
  FROM public.conversations c
  WHERE c.agency_id = target_agency_id
    AND c.participant_pair_key = pair_key;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  BEGIN
    INSERT INTO public.conversations (
      agency_id,
      created_by,
      participant_pair_key
    )
    VALUES (
      target_agency_id,
      me,
      pair_key
    )
    RETURNING id INTO new_id;

    INSERT INTO public.conversation_members (conversation_id, agency_id, user_id)
    VALUES
      (new_id, target_agency_id, me),
      (new_id, target_agency_id, other_user_id);

    RETURN new_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT c.id
      INTO existing_id
      FROM public.conversations c
      WHERE c.agency_id = target_agency_id
        AND c.participant_pair_key = pair_key;

      IF existing_id IS NULL THEN
        RAISE;
      END IF;
      RETURN existing_id;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conversation_belongs_to_agency(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.direct_conversation_pair_key(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_direct_conversation_member_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_conversation_member_prefs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_conversation_last_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_direct_conversation(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_belongs_to_agency(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.direct_conversation_pair_key(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: members only; no client insert/update/delete (use start_direct_conversation)
DROP POLICY IF EXISTS conversations_select_member ON public.conversations;
CREATE POLICY conversations_select_member
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(id));

-- Conversation members: view fellow members of own conversations
DROP POLICY IF EXISTS conversation_members_select_fellow ON public.conversation_members;
CREATE POLICY conversation_members_select_fellow
  ON public.conversation_members
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(conversation_id));

-- Members may update only their own archive/mute flags
DROP POLICY IF EXISTS conversation_members_update_own_prefs ON public.conversation_members;
CREATE POLICY conversation_members_update_own_prefs
  ON public.conversation_members
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND public.conversation_belongs_to_agency(conversation_id, agency_id)
  );

-- No INSERT/DELETE policies for conversation_members (security-definer function only).

-- Direct messages: members may read
DROP POLICY IF EXISTS direct_messages_select_member ON public.direct_messages;
CREATE POLICY direct_messages_select_member
  ON public.direct_messages
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(conversation_id));

-- Members may send as themselves into own conversations
DROP POLICY IF EXISTS direct_messages_insert_member ON public.direct_messages;
CREATE POLICY direct_messages_insert_member
  ON public.direct_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND public.conversation_belongs_to_agency(conversation_id, agency_id)
    AND deleted_at IS NULL
  );

-- Authors may edit own non-deleted messages within 15 minutes
DROP POLICY IF EXISTS direct_messages_update_own_recent ON public.direct_messages;
CREATE POLICY direct_messages_update_own_recent
  ON public.direct_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND deleted_at IS NULL
    AND created_at > (now() - interval '15 minutes')
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND public.conversation_belongs_to_agency(conversation_id, agency_id)
  );

-- Authors may soft-delete own messages at any time (including after edit window)
DROP POLICY IF EXISTS direct_messages_soft_delete_own ON public.direct_messages;
CREATE POLICY direct_messages_soft_delete_own
  ON public.direct_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND deleted_at IS NULL
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND public.conversation_belongs_to_agency(conversation_id, agency_id)
    AND deleted_at IS NOT NULL
  );

-- No hard DELETE policy for clients. No admin blanket-read policies.

-- Realtime (optional; ignore if publication unavailable)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END
$$;

COMMIT;
