-- Briefing Categories & Templates MVP.
-- Soft-deactivate catalog rows; do not hard-delete historically referenced names.
-- Do not apply from the Expo client.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.briefing_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color_key text,
  icon_key text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefing_categories_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS briefing_categories_agency_name_normalized_uidx
  ON public.briefing_categories (agency_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS briefing_categories_agency_id_idx
  ON public.briefing_categories (agency_id);

CREATE INDEX IF NOT EXISTS briefing_categories_agency_active_sort_idx
  ON public.briefing_categories (agency_id, is_active, sort_order, name);

DROP TRIGGER IF EXISTS briefing_categories_set_updated_at ON public.briefing_categories;
CREATE TRIGGER briefing_categories_set_updated_at
  BEFORE UPDATE ON public.briefing_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.briefing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.briefing_categories (id) ON DELETE SET NULL,
  name text NOT NULL,
  title_template text,
  body_template text NOT NULL,
  default_priority public.briefing_priority NOT NULL DEFAULT 'medium',
  requires_acknowledgement boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefing_templates_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT briefing_templates_body_not_blank CHECK (length(btrim(body_template)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS briefing_templates_agency_name_normalized_uidx
  ON public.briefing_templates (agency_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS briefing_templates_agency_id_idx
  ON public.briefing_templates (agency_id);

CREATE INDEX IF NOT EXISTS briefing_templates_agency_active_idx
  ON public.briefing_templates (agency_id, is_active, name);

CREATE INDEX IF NOT EXISTS briefing_templates_category_id_idx
  ON public.briefing_templates (category_id);

DROP TRIGGER IF EXISTS briefing_templates_set_updated_at ON public.briefing_templates;
CREATE TRIGGER briefing_templates_set_updated_at
  BEFORE UPDATE ON public.briefing_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_briefing_catalog(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_personnel(target_agency_id);
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs: categories
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_briefing_category(
  p_agency_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_color_key text DEFAULT NULL,
  p_icon_key text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL
)
RETURNS public.briefing_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := NULLIF(btrim(COALESCE(p_name, '')), '');
  next_sort integer;
  category_row public.briefing_categories%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;
  IF cleaned IS NULL THEN
    RAISE EXCEPTION 'Category name is required';
  END IF;
  IF lower(cleaned) = 'other' THEN
    RAISE EXCEPTION 'Enter a specific category name instead of Other';
  END IF;
  IF NOT public.can_manage_briefing_catalog(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing categories';
  END IF;

  IF p_sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1
    INTO next_sort
    FROM public.briefing_categories
    WHERE agency_id = p_agency_id;
  ELSE
    next_sort := p_sort_order;
  END IF;

  INSERT INTO public.briefing_categories (
    agency_id,
    name,
    description,
    color_key,
    icon_key,
    sort_order,
    created_by
  )
  VALUES (
    p_agency_id,
    cleaned,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_color_key, '')), ''),
    NULLIF(btrim(COALESCE(p_icon_key, '')), ''),
    next_sort,
    me
  )
  RETURNING * INTO category_row;

  RETURN category_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A category with this name already exists for the agency';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_briefing_category(
  p_category_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_clear_description boolean DEFAULT false,
  p_color_key text DEFAULT NULL,
  p_clear_color_key boolean DEFAULT false,
  p_icon_key text DEFAULT NULL,
  p_clear_icon_key boolean DEFAULT false,
  p_sort_order integer DEFAULT NULL
)
RETURNS public.briefing_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  category_row public.briefing_categories%ROWTYPE;
  cleaned text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO category_row FROM public.briefing_categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found';
  END IF;
  IF NOT public.can_manage_briefing_catalog(category_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing categories';
  END IF;

  IF p_name IS NOT NULL THEN
    cleaned := NULLIF(btrim(p_name), '');
    IF cleaned IS NULL THEN
      RAISE EXCEPTION 'Category name is required';
    END IF;
    IF lower(cleaned) = 'other' THEN
      RAISE EXCEPTION 'Enter a specific category name instead of Other';
    END IF;
    category_row.name := cleaned;
  END IF;

  IF p_clear_description THEN
    category_row.description := NULL;
  ELSIF p_description IS NOT NULL THEN
    category_row.description := NULLIF(btrim(p_description), '');
  END IF;

  IF p_clear_color_key THEN
    category_row.color_key := NULL;
  ELSIF p_color_key IS NOT NULL THEN
    category_row.color_key := NULLIF(btrim(p_color_key), '');
  END IF;

  IF p_clear_icon_key THEN
    category_row.icon_key := NULL;
  ELSIF p_icon_key IS NOT NULL THEN
    category_row.icon_key := NULLIF(btrim(p_icon_key), '');
  END IF;

  IF p_sort_order IS NOT NULL THEN
    category_row.sort_order := p_sort_order;
  END IF;

  UPDATE public.briefing_categories
  SET
    name = category_row.name,
    description = category_row.description,
    color_key = category_row.color_key,
    icon_key = category_row.icon_key,
    sort_order = category_row.sort_order,
    updated_at = now()
  WHERE id = p_category_id
  RETURNING * INTO category_row;

  RETURN category_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A category with this name already exists for the agency';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_briefing_category_active(
  p_category_id uuid,
  p_is_active boolean
)
RETURNS public.briefing_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  category_row public.briefing_categories%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO category_row FROM public.briefing_categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found';
  END IF;
  IF NOT public.can_manage_briefing_catalog(category_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing categories';
  END IF;

  UPDATE public.briefing_categories
  SET
    is_active = COALESCE(p_is_active, false),
    updated_at = now()
  WHERE id = p_category_id
  RETURNING * INTO category_row;

  RETURN category_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_briefing_categories(
  p_agency_id uuid,
  p_category_ids uuid[]
)
RETURNS SETOF public.briefing_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  category_id uuid;
  idx integer := 0;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;
  IF p_category_ids IS NULL OR cardinality(p_category_ids) = 0 THEN
    RAISE EXCEPTION 'Category order is required';
  END IF;
  IF NOT public.can_manage_briefing_catalog(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing categories';
  END IF;

  FOREACH category_id IN ARRAY p_category_ids
  LOOP
    idx := idx + 1;
    UPDATE public.briefing_categories
    SET
      sort_order = idx,
      updated_at = now()
    WHERE id = category_id
      AND agency_id = p_agency_id;
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.briefing_categories
  WHERE agency_id = p_agency_id
  ORDER BY sort_order, name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs: templates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_briefing_template(
  p_agency_id uuid,
  p_name text,
  p_body_template text,
  p_title_template text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_default_priority public.briefing_priority DEFAULT 'medium',
  p_requires_acknowledgement boolean DEFAULT true
)
RETURNS public.briefing_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  cleaned_body text := NULLIF(btrim(COALESCE(p_body_template, '')), '');
  category_agency uuid;
  template_row public.briefing_templates%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency is required';
  END IF;
  IF cleaned_name IS NULL THEN
    RAISE EXCEPTION 'Template name is required';
  END IF;
  IF cleaned_body IS NULL THEN
    RAISE EXCEPTION 'Template body is required';
  END IF;
  IF NOT public.can_manage_briefing_catalog(p_agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing templates';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT agency_id INTO category_agency
    FROM public.briefing_categories
    WHERE id = p_category_id;
    IF category_agency IS NULL THEN
      RAISE EXCEPTION 'Category not found';
    END IF;
    IF category_agency <> p_agency_id THEN
      RAISE EXCEPTION 'Category must belong to the same agency';
    END IF;
  END IF;

  INSERT INTO public.briefing_templates (
    agency_id,
    category_id,
    name,
    title_template,
    body_template,
    default_priority,
    requires_acknowledgement,
    created_by
  )
  VALUES (
    p_agency_id,
    p_category_id,
    cleaned_name,
    NULLIF(btrim(COALESCE(p_title_template, '')), ''),
    cleaned_body,
    COALESCE(p_default_priority, 'medium'::public.briefing_priority),
    COALESCE(p_requires_acknowledgement, true),
    me
  )
  RETURNING * INTO template_row;

  RETURN template_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A template with this name already exists for the agency';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_briefing_template(
  p_template_id uuid,
  p_name text DEFAULT NULL,
  p_title_template text DEFAULT NULL,
  p_clear_title_template boolean DEFAULT false,
  p_body_template text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_clear_category boolean DEFAULT false,
  p_default_priority public.briefing_priority DEFAULT NULL,
  p_requires_acknowledgement boolean DEFAULT NULL
)
RETURNS public.briefing_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  template_row public.briefing_templates%ROWTYPE;
  cleaned text;
  category_agency uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO template_row FROM public.briefing_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  IF NOT public.can_manage_briefing_catalog(template_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing templates';
  END IF;

  IF p_name IS NOT NULL THEN
    cleaned := NULLIF(btrim(p_name), '');
    IF cleaned IS NULL THEN
      RAISE EXCEPTION 'Template name is required';
    END IF;
    template_row.name := cleaned;
  END IF;

  IF p_clear_title_template THEN
    template_row.title_template := NULL;
  ELSIF p_title_template IS NOT NULL THEN
    template_row.title_template := NULLIF(btrim(p_title_template), '');
  END IF;

  IF p_body_template IS NOT NULL THEN
    cleaned := NULLIF(btrim(p_body_template), '');
    IF cleaned IS NULL THEN
      RAISE EXCEPTION 'Template body is required';
    END IF;
    template_row.body_template := cleaned;
  END IF;

  IF p_clear_category THEN
    template_row.category_id := NULL;
  ELSIF p_category_id IS NOT NULL THEN
    SELECT agency_id INTO category_agency
    FROM public.briefing_categories
    WHERE id = p_category_id;
    IF category_agency IS NULL THEN
      RAISE EXCEPTION 'Category not found';
    END IF;
    IF category_agency <> template_row.agency_id THEN
      RAISE EXCEPTION 'Category must belong to the same agency';
    END IF;
    template_row.category_id := p_category_id;
  END IF;

  IF p_default_priority IS NOT NULL THEN
    template_row.default_priority := p_default_priority;
  END IF;

  IF p_requires_acknowledgement IS NOT NULL THEN
    template_row.requires_acknowledgement := p_requires_acknowledgement;
  END IF;

  UPDATE public.briefing_templates
  SET
    name = template_row.name,
    title_template = template_row.title_template,
    body_template = template_row.body_template,
    category_id = template_row.category_id,
    default_priority = template_row.default_priority,
    requires_acknowledgement = template_row.requires_acknowledgement,
    updated_at = now()
  WHERE id = p_template_id
  RETURNING * INTO template_row;

  RETURN template_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A template with this name already exists for the agency';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_briefing_template_active(
  p_template_id uuid,
  p_is_active boolean
)
RETURNS public.briefing_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  template_row public.briefing_templates%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO template_row FROM public.briefing_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  IF NOT public.can_manage_briefing_catalog(template_row.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing templates';
  END IF;

  UPDATE public.briefing_templates
  SET
    is_active = COALESCE(p_is_active, false),
    updated_at = now()
  WHERE id = p_template_id
  RETURNING * INTO template_row;

  RETURN template_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_briefing_template(
  p_template_id uuid,
  p_name text DEFAULT NULL
)
RETURNS public.briefing_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  source public.briefing_templates%ROWTYPE;
  cleaned_name text;
  template_row public.briefing_templates%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO source FROM public.briefing_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  IF NOT public.can_manage_briefing_catalog(source.agency_id) THEN
    RAISE EXCEPTION 'Only agency admins or command staff may manage briefing templates';
  END IF;

  cleaned_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF cleaned_name IS NULL THEN
    cleaned_name := source.name || ' (Copy)';
  END IF;

  INSERT INTO public.briefing_templates (
    agency_id,
    category_id,
    name,
    title_template,
    body_template,
    default_priority,
    requires_acknowledgement,
    is_active,
    created_by
  )
  VALUES (
    source.agency_id,
    source.category_id,
    cleaned_name,
    source.title_template,
    source.body_template,
    source.default_priority,
    source.requires_acknowledgement,
    true,
    me
  )
  RETURNING * INTO template_row;

  RETURN template_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A template with this name already exists for the agency';
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.briefing_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefing_templates ENABLE ROW LEVEL SECURITY;

-- Mutations go through SECURITY DEFINER RPCs only (no INSERT/UPDATE/DELETE policies).

DROP POLICY IF EXISTS briefing_categories_select_members ON public.briefing_categories;
CREATE POLICY briefing_categories_select_members
  ON public.briefing_categories
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_agency_member(agency_id)
    AND (
      is_active = true
      OR public.can_manage_briefing_catalog(agency_id)
    )
  );

DROP POLICY IF EXISTS briefing_templates_select_members ON public.briefing_templates;
CREATE POLICY briefing_templates_select_members
  ON public.briefing_templates
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_agency_member(agency_id)
    AND (
      is_active = true
      OR public.can_manage_briefing_catalog(agency_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE public.briefing_categories TO authenticated;
GRANT SELECT ON TABLE public.briefing_templates TO authenticated;

REVOKE ALL ON FUNCTION public.can_manage_briefing_catalog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_briefing_category(uuid, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_briefing_category(uuid, text, text, boolean, text, boolean, text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_briefing_category_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_briefing_categories(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_briefing_template(uuid, text, text, text, uuid, public.briefing_priority, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_briefing_template(uuid, text, text, boolean, text, uuid, boolean, public.briefing_priority, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_briefing_template_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duplicate_briefing_template(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_briefing_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_briefing_category(uuid, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_briefing_category(uuid, text, text, boolean, text, boolean, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_briefing_category_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_briefing_categories(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_briefing_template(uuid, text, text, text, uuid, public.briefing_priority, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_briefing_template(uuid, text, text, boolean, text, uuid, boolean, public.briefing_priority, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_briefing_template_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_briefing_template(uuid, text) TO authenticated;

COMMIT;
