-- OPTIONAL cleanup: normalize historical briefings.shift_name values.
-- Review carefully before running. Does not auto-execute from the app.
--
-- Goals:
-- 1) Trim / collapse whitespace
-- 2) Prefer matching active agency_shifts.name when normalized keys match
-- 3) Otherwise title-case remaining free-text values
--
-- Does NOT merge distinct names such as "Day" and "Day Shift".

BEGIN;

-- Preview candidates first:
-- SELECT
--   b.id,
--   b.agency_id,
--   b.shift_name AS current_value,
--   COALESCE(
--     s.name,
--     initcap(lower(btrim(regexp_replace(b.shift_name, '\s+', ' ', 'g'))))
--   ) AS proposed_value
-- FROM public.briefings b
-- LEFT JOIN LATERAL (
--   SELECT sh.name
--   FROM public.agency_shifts sh
--   WHERE sh.agency_id = b.agency_id
--     AND sh.is_active = true
--     AND lower(btrim(regexp_replace(sh.name, '\s+', ' ', 'g')))
--       = lower(btrim(regexp_replace(b.shift_name, '\s+', ' ', 'g')))
--   ORDER BY sh.sort_order, sh.name
--   LIMIT 1
-- ) s ON true
-- WHERE b.shift_name IS NOT NULL
--   AND btrim(b.shift_name) <> ''
--   AND b.shift_name IS DISTINCT FROM COALESCE(
--     s.name,
--     initcap(lower(btrim(regexp_replace(b.shift_name, '\s+', ' ', 'g'))))
--   );

UPDATE public.briefings b
SET
  shift_name = COALESCE(
    s.name,
    initcap(lower(btrim(regexp_replace(b.shift_name, '\s+', ' ', 'g'))))
  ),
  updated_at = now()
FROM public.briefings src
LEFT JOIN LATERAL (
  SELECT sh.name
  FROM public.agency_shifts sh
  WHERE sh.agency_id = src.agency_id
    AND sh.is_active = true
    AND lower(btrim(regexp_replace(sh.name, '\s+', ' ', 'g')))
      = lower(btrim(regexp_replace(COALESCE(src.shift_name, ''), '\s+', ' ', 'g')))
  ORDER BY sh.sort_order, sh.name
  LIMIT 1
) s ON true
WHERE b.id = src.id
  AND src.shift_name IS NOT NULL
  AND btrim(src.shift_name) <> ''
  AND src.shift_name IS DISTINCT FROM COALESCE(
    s.name,
    initcap(lower(btrim(regexp_replace(src.shift_name, '\s+', ' ', 'g'))))
  );

COMMIT;
