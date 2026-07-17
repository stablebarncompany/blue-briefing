# Briefing Categories & Templates

Agency-configurable briefing categories and reusable templates for Blue Briefing.

## Ownership

- Categories and templates are **agency-owned** (`agency_id` required).
- Rows are soft-deactivated (`is_active = false`); this MVP does **not** hard-delete catalog rows that may be referenced by historical briefing text.
- Briefings continue to store category as free-text `briefings.category` for compatibility.

## Role permissions

| Action | Agency Admin | Command Staff | Supervisor | Other members |
| --- | --- | --- | --- | --- |
| View active categories/templates | Yes | Yes | Yes | Yes |
| Use categories/templates on create/edit | Yes | Yes | Yes | Yes |
| Create / edit / reorder / deactivate catalog | Yes | Yes | No | No |

Database helper: `can_manage_briefing_catalog(agency_id)` (aliases personnel management: admin + command staff).

Mutations are **SECURITY DEFINER RPCs** only. Tables have SELECT RLS for active agency members (inactive rows visible to managers).

## Historical text compatibility

- Existing `briefings.category` values are preserved.
- New/edited briefings save the **canonical catalog name** when a normalized match exists; otherwise a trimmed/title-cased custom value.
- Filters merge active agency categories with distinct historical values.
- Matching is case-insensitive after trim / whitespace collapse.
- Prefer configured category names for chip labels.

### Normalization rules

Shared helpers live in `src/types/briefingCategories.ts`:

- trim whitespace
- collapse repeated spaces
- lowercase for comparison keys
- light punctuation normalization (dashes/slashes → spaces)
- display: catalog name preferred; else title-case historical text
- do **not** merge distinct labels such as `Patrol` vs `Patrol Ops`

## Template behavior

- Templates store: name, optional title template, body template, optional category, default priority, acknowledgement default.
- Selecting a template on **New Briefing** pre-fills title, body, category, priority, and acknowledgement.
- Users may edit all pre-filled fields before submit.
- Switching to another template confirms before overwriting entered content.
- Example outlines (End-of-Shift Report, BOLO, etc.) are UI suggestions only and are **not** auto-inserted into the database.
- Duplicate / deactivate / reactivate are available to catalog managers.

## Category suggestions

Suggested names (Officer Safety, BOLO, …, Other) appear when creating categories. Selecting **Other** requires a custom name. Suggestions are not auto-seeded.

## Routes

- `/briefings/categories` — manage categories (admin/command)
- `/briefings/templates` — manage templates (admin/command)
- Entry points from the Briefings list for managers

## Printing

Web print for briefing details includes category, priority, shift, author, created time, acknowledgement status, and attachment filenames/types/sizes **without** signed URLs.

## Current limitations

- No `briefings.category_id` foreign key yet (text snapshot only).
- No analytics on category usage beyond a simple briefing count in the manager UI.
- No AI summaries, scheduling, or payroll.
- Migration must be applied manually: `supabase/migrations/20260717120000_briefing_categories_templates_mvp.sql`

## Future work

- Optional `category_id` on briefings with retained text snapshot
- Analytics: category volume, acknowledgement rates, template usage
- Automated end-of-shift summary drafts from templates
- Richer icon set and agency-branded accents
