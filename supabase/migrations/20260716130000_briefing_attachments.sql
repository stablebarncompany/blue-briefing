-- Blue Briefing: private briefing attachments (Storage + metadata)
-- Private bucket; agency-scoped paths; no public read.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers (path parsing + briefing state)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.uuid_from_path_segment(segment text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF segment IS NULL OR segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN segment::uuid;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.briefing_attachment_path_agency_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.uuid_from_path_segment(split_part(object_name, '/', 1));
$$;

CREATE OR REPLACE FUNCTION public.briefing_attachment_path_briefing_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.uuid_from_path_segment(split_part(object_name, '/', 2));
$$;

CREATE OR REPLACE FUNCTION public.briefing_is_active_for_agency(
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
      AND b.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_briefing_attachment_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.briefing_attachment_path_agency_id(object_name) IS NOT NULL
    AND public.briefing_attachment_path_briefing_id(object_name) IS NOT NULL
    AND split_part(object_name, '/', 3) <> ''
    AND split_part(object_name, '/', 4) = ''
    AND public.is_active_agency_member(public.briefing_attachment_path_agency_id(object_name))
    AND public.briefing_belongs_to_agency(
      public.briefing_attachment_path_briefing_id(object_name),
      public.briefing_attachment_path_agency_id(object_name)
    );
$$;

REVOKE ALL ON FUNCTION public.uuid_from_path_segment(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.briefing_attachment_path_agency_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.briefing_attachment_path_briefing_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.briefing_is_active_for_agency(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_briefing_attachment_object(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.uuid_from_path_segment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.briefing_attachment_path_agency_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.briefing_attachment_path_briefing_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.briefing_is_active_for_agency(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_briefing_attachment_object(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Metadata table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.briefing_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid NOT NULL REFERENCES public.briefings (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  attachment_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefing_attachments_type_check
    CHECK (attachment_type IN ('image', 'document')),
  CONSTRAINT briefing_attachments_filename_not_blank
    CHECK (length(btrim(original_filename)) > 0),
  CONSTRAINT briefing_attachments_path_not_blank
    CHECK (length(btrim(storage_path)) > 0),
  CONSTRAINT briefing_attachments_size_positive
    CHECK (size_bytes > 0 AND size_bytes <= 6291456),
  CONSTRAINT briefing_attachments_mime_allowed
    CHECK (
      mime_type IN (
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    )
);

CREATE INDEX IF NOT EXISTS briefing_attachments_briefing_id_idx
  ON public.briefing_attachments (briefing_id);

CREATE INDEX IF NOT EXISTS briefing_attachments_agency_id_idx
  ON public.briefing_attachments (agency_id);

CREATE INDEX IF NOT EXISTS briefing_attachments_uploaded_by_idx
  ON public.briefing_attachments (uploaded_by);

CREATE INDEX IF NOT EXISTS briefing_attachments_created_at_idx
  ON public.briefing_attachments (created_at DESC);

ALTER TABLE public.briefing_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS briefing_attachments_select_agency_member ON public.briefing_attachments;
CREATE POLICY briefing_attachments_select_agency_member
  ON public.briefing_attachments
  FOR SELECT
  TO authenticated
  USING (public.is_active_agency_member(agency_id));

DROP POLICY IF EXISTS briefing_attachments_insert_agency_member ON public.briefing_attachments;
CREATE POLICY briefing_attachments_insert_agency_member
  ON public.briefing_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.is_active_agency_member(agency_id)
    AND public.briefing_belongs_to_agency(briefing_id, agency_id)
    AND storage_path LIKE (agency_id::text || '/' || briefing_id::text || '/%')
  );

DROP POLICY IF EXISTS briefing_attachments_delete_own_active ON public.briefing_attachments;
CREATE POLICY briefing_attachments_delete_own_active
  ON public.briefing_attachments
  FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    AND public.is_active_agency_member(agency_id)
    AND public.briefing_is_active_for_agency(briefing_id, agency_id)
  );

DROP POLICY IF EXISTS briefing_attachments_delete_supervisory ON public.briefing_attachments;
CREATE POLICY briefing_attachments_delete_supervisory
  ON public.briefing_attachments
  FOR DELETE
  TO authenticated
  USING (
    public.has_agency_role(
      agency_id,
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    )
  );

-- No UPDATE policies: attachment metadata is immutable for normal clients.

-- ---------------------------------------------------------------------------
-- Private storage bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'briefing-attachments',
  'briefing-attachments',
  false,
  6291456,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS briefing_attachments_storage_select ON storage.objects;
CREATE POLICY briefing_attachments_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'briefing-attachments'
    AND public.can_access_briefing_attachment_object(name)
  );

DROP POLICY IF EXISTS briefing_attachments_storage_insert ON storage.objects;
CREATE POLICY briefing_attachments_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'briefing-attachments'
    AND public.can_access_briefing_attachment_object(name)
  );

DROP POLICY IF EXISTS briefing_attachments_storage_delete_own ON storage.objects;
CREATE POLICY briefing_attachments_storage_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'briefing-attachments'
    AND owner = auth.uid()
    AND public.can_access_briefing_attachment_object(name)
  );

DROP POLICY IF EXISTS briefing_attachments_storage_delete_supervisory ON storage.objects;
CREATE POLICY briefing_attachments_storage_delete_supervisory
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'briefing-attachments'
    AND public.has_agency_role(
      public.briefing_attachment_path_agency_id(name),
      ARRAY['supervisor', 'command_staff', 'agency_admin']::public.agency_role[]
    )
  );

COMMIT;
