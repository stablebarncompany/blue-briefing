# Briefings MVP

Agency-scoped shift pass-ons with acknowledgements, pin/resolve/archive controls, and a Home dashboard summary.

## Tables

### `public.briefings`

Operational pass-on records. Every row includes `agency_id`. Authors are `auth.users` via `author_id`. Priority and status use enums (`briefing_priority`, `briefing_status`).

### `public.briefing_acknowledgements`

One acknowledgement per user per briefing (`unique (briefing_id, user_id)`). `agency_id` must match the briefing’s agency and is enforced by RLS helpers.

Migration file (do not apply from the app):

`supabase/migrations/20260715210000_briefings_mvp.sql`

## Role permissions

| Action | Who |
| --- | --- |
| View briefings / acknowledgements | Active agency members of the selected agency |
| Create briefing | Active agency members (`author_id` must be `auth.uid()`) |
| Edit content | Author while status is `active`, or supervisor / command staff / agency admin |
| Pin / resolve / archive | Supervisor / command staff / agency admin |
| Delete | Agency admin / command staff only |
| Acknowledge / remove own ack | Authenticated member; `user_id` must be self |

UI hides unauthorized controls. Supabase RLS is the enforcement boundary.

## Acknowledgement behavior

- New briefings default to `requires_acknowledgement = true`.
- Users may insert only their own acknowledgement.
- Users may delete only their own acknowledgement.
- Acknowledgement lists are visible to active agency members.
- Home “unacknowledged” counts only active briefings that require acknowledgement and lack the current user’s ack.

## Pin / resolve / archive

- **Pin:** toggles `is_pinned` for supervisory roles. Lists sort pinned first, then newest.
- **Resolve:** sets `status = resolved` and `resolved_at`.
- **Archive:** sets `status = archived` and `archived_at`.
- Authors retain update rights only while a briefing remains `active`.

## Client architecture

- Types: `src/types/briefings.ts`
- Service: `src/services/briefings/` (always pass `AgencyProvider` `currentAgency.id`)
- Screens:
  - `/briefings` list + filters
  - `/briefings/create`
  - `/briefings/[id]` details + actions
- Home pulls live counts and up to three pinned/newest active briefings

## Current MVP limitations

- Attachments are documented separately in `docs/BriefingAttachments.md`
- No notifications or push alerts
- No AI summaries
- No scheduling / auto-expire
- No Groups, DMs, or personnel administration
- No soft-delete UI (hard delete allowed only for admin/command via RLS; no delete button in MVP UI)
- Print is web-only (`window.print`)
- Filter chips for shift/category appear after at least one briefing has those values
