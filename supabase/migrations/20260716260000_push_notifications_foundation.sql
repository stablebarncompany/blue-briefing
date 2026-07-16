-- Push notification device registration + preference foundation.
-- Native push sending is handled by a trusted Edge Function (not the Expo client).
-- Do not apply from the app.

BEGIN;

-- ---------------------------------------------------------------------------
-- Push devices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies (id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_identifier text,
  device_name text,
  app_version text,
  is_active boolean NOT NULL DEFAULT true,
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_token_not_blank CHECK (length(btrim(expo_push_token)) > 0),
  CONSTRAINT push_devices_user_token_uidx UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS push_devices_user_id_idx
  ON public.push_devices (user_id);

CREATE INDEX IF NOT EXISTS push_devices_agency_id_idx
  ON public.push_devices (agency_id);

CREATE INDEX IF NOT EXISTS push_devices_active_user_idx
  ON public.push_devices (user_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS push_devices_token_idx
  ON public.push_devices (expo_push_token);

DROP TRIGGER IF EXISTS push_devices_set_updated_at ON public.push_devices;
CREATE TRIGGER push_devices_set_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Notification preferences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies (id) ON DELETE CASCADE,
  critical_briefings boolean NOT NULL DEFAULT true,
  acknowledgement_requests boolean NOT NULL DEFAULT true,
  direct_messages boolean NOT NULL DEFAULT true,
  group_mentions boolean NOT NULL DEFAULT true,
  group_activity boolean NOT NULL DEFAULT false,
  membership_changes boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_user_agency_uidx UNIQUE (user_id, agency_id)
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx
  ON public.notification_preferences (user_id);

CREATE INDEX IF NOT EXISTS notification_preferences_agency_id_idx
  ON public.notification_preferences (agency_id);

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at ON public.notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Idempotent push status on in-app notifications
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.notifications
    ADD COLUMN push_status text NOT NULL DEFAULT 'pending';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.notifications
    ADD COLUMN push_attempted_at timestamptz;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END
$$;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_push_status_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_push_status_check
  CHECK (push_status IN ('pending', 'processing', 'skipped', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS notifications_push_status_pending_idx
  ON public.notifications (push_status, created_at)
  WHERE push_status = 'pending';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_push_device(
  p_expo_push_token text,
  p_platform text,
  p_agency_id uuid DEFAULT NULL,
  p_device_identifier text DEFAULT NULL,
  p_device_name text DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS public.push_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned_token text := NULLIF(btrim(COALESCE(p_expo_push_token, '')), '');
  row_data public.push_devices%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF cleaned_token IS NULL THEN
    RAISE EXCEPTION 'Push token is required';
  END IF;

  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Unsupported platform';
  END IF;

  IF p_agency_id IS NOT NULL AND NOT public.is_active_agency_member(p_agency_id) THEN
    RAISE EXCEPTION 'Agency membership is required';
  END IF;

  INSERT INTO public.push_devices (
    user_id,
    agency_id,
    expo_push_token,
    platform,
    device_identifier,
    device_name,
    app_version,
    is_active,
    last_registered_at
  )
  VALUES (
    me,
    p_agency_id,
    cleaned_token,
    p_platform,
    NULLIF(btrim(COALESCE(p_device_identifier, '')), ''),
    NULLIF(btrim(COALESCE(p_device_name, '')), ''),
    NULLIF(btrim(COALESCE(p_app_version, '')), ''),
    true,
    now()
  )
  ON CONFLICT (user_id, expo_push_token)
  DO UPDATE SET
    agency_id = EXCLUDED.agency_id,
    platform = EXCLUDED.platform,
    device_identifier = COALESCE(EXCLUDED.device_identifier, public.push_devices.device_identifier),
    device_name = COALESCE(EXCLUDED.device_name, public.push_devices.device_name),
    app_version = COALESCE(EXCLUDED.app_version, public.push_devices.app_version),
    is_active = true,
    last_registered_at = now(),
    updated_at = now()
  RETURNING * INTO row_data;

  RETURN row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_push_device(p_expo_push_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned_token text := NULLIF(btrim(COALESCE(p_expo_push_token, '')), '');
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF cleaned_token IS NULL THEN
    RAISE EXCEPTION 'Push token is required';
  END IF;

  UPDATE public.push_devices
  SET is_active = false,
      updated_at = now()
  WHERE user_id = me
    AND expo_push_token = cleaned_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_my_push_devices()
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

  UPDATE public.push_devices
  SET is_active = false,
      updated_at = now()
  WHERE user_id = me
    AND is_active = true;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_notification_preferences(p_agency_id uuid)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  row_data public.notification_preferences%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;

  IF NOT public.is_active_agency_member(p_agency_id) THEN
    RAISE EXCEPTION 'Agency membership is required';
  END IF;

  SELECT * INTO row_data
  FROM public.notification_preferences p
  WHERE p.user_id = me
    AND p.agency_id = p_agency_id;

  IF FOUND THEN
    RETURN row_data;
  END IF;

  INSERT INTO public.notification_preferences (user_id, agency_id)
  VALUES (me, p_agency_id)
  RETURNING * INTO row_data;

  RETURN row_data;
END;
$$;

-- Atomically claim a notification for push dispatch (idempotent).
CREATE OR REPLACE FUNCTION public.claim_notification_for_push(p_notification_id uuid)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data public.notifications%ROWTYPE;
BEGIN
  UPDATE public.notifications n
  SET push_status = 'processing',
      push_attempted_at = now()
  WHERE n.id = p_notification_id
    AND n.push_status = 'pending'
  RETURNING * INTO row_data;

  IF NOT FOUND THEN
    SELECT * INTO row_data
    FROM public.notifications n
    WHERE n.id = p_notification_id;
  END IF;

  RETURN row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_push_skipped(
  p_notification_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET push_status = 'skipped',
      push_attempted_at = now()
  WHERE id = p_notification_id
    AND push_status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_push_sent(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET push_status = 'sent',
      push_attempted_at = COALESCE(push_attempted_at, now())
  WHERE id = p_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_push_failed(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET push_status = 'failed',
      push_attempted_at = COALESCE(push_attempted_at, now())
  WHERE id = p_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_push_token_admin(p_expo_push_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.push_devices
  SET is_active = false,
      updated_at = now()
  WHERE expo_push_token = NULLIF(btrim(COALESCE(p_expo_push_token, '')), '')
    AND is_active = true;
END;
$$;

-- Types that are eligible for native push in this MVP.
CREATE OR REPLACE FUNCTION public.notification_type_supports_push(
  p_type public.notification_type
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_type IN (
    'critical_briefing',
    'briefing_ack_required',
    'direct_message',
    'group_mention',
    'membership_updated',
    'membership_suspended',
    'membership_reactivated',
    'access_removed'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies (owner-only; no admin blanket token access)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS push_devices_select_own ON public.push_devices;
CREATE POLICY push_devices_select_own
  ON public.push_devices
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_devices_insert_own ON public.push_devices;
CREATE POLICY push_devices_insert_own
  ON public.push_devices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      agency_id IS NULL
      OR public.is_active_agency_member(agency_id)
    )
  );

DROP POLICY IF EXISTS push_devices_update_own ON public.push_devices;
CREATE POLICY push_devices_update_own
  ON public.push_devices
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      agency_id IS NULL
      OR public.is_active_agency_member(agency_id)
    )
  );

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_own
  ON public.notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND agency_id IS NOT NULL
    AND public.is_active_agency_member(agency_id)
  );

DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own
  ON public.notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      agency_id IS NULL
      OR public.is_active_agency_member(agency_id)
    )
  );

REVOKE ALL ON TABLE public.push_devices FROM PUBLIC;
REVOKE ALL ON TABLE public.push_devices FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_devices TO authenticated;

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_push_device(text, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_my_push_devices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_notification_preferences(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_for_push(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_push_skipped(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_push_sent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_push_failed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_push_token_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_type_supports_push(public.notification_type) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_push_device(text, text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_push_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_my_push_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_notification_preferences(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_type_supports_push(public.notification_type) TO authenticated;

-- Claim/mark helpers are for trusted server roles (service_role) only — not authenticated clients.
GRANT EXECUTE ON FUNCTION public.claim_notification_for_push(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_push_skipped(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_push_sent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_push_failed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_push_token_admin(text) TO service_role;

COMMIT;
