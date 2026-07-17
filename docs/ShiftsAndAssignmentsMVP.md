# Shifts & Assignments MVP

Agency shift catalog and personnel assignments for Blue Briefing. This is not full scheduling, payroll, timekeeping, overtime, leave, or calendar rotations.

Migration (do not apply from the app):

`supabase/migrations/20260717090000_agency_shifts_mvp.sql`

## Shift model

### `public.agency_shifts`

Configurable shift definitions per agency:

- name (unique per agency when normalized)
- description, shift_code
- start_time / end_time
- color_key, sort_order
- `is_active` soft flag (no hard-delete of catalog rows with history)

Suggested create names (UI only; not auto-inserted):

A/B/C/D Shift, Day/Night/Evening/Swing/Rotating, Administration, Dispatch Days/Nights, Other (requires custom name; “Other” is never saved).

### `public.personnel_shift_assignments`

Links an active agency member to a shift:

- `assignment_type`: `primary` | `secondary` | `temporary`
- optional `effective_start` / `effective_end`
- `is_active` soft remove

Constraint: at most one **active primary** assignment per `(agency_id, user_id)`.

### `public.shift_supervisors`

Associates supervisors with a shift. Does **not** elevate `agency_members.role`.

## Primary / secondary / temporary

| Type | Meaning in MVP |
| --- | --- |
| primary | Member’s main shift; syncs legacy `agency_members.shift_name` |
| secondary | Additional ongoing assignment |
| temporary | Time-bounded or special duty assignment |

## Supervisor behavior

- Agency Admin / Command Staff assign/remove shift supervisors.
- Supervisors who are listed on a shift may manage assignments for **that** shift via `can_manage_shift_assignments`.
- Supervisors cannot create/deactivate the agency shift catalog unless they are admin/command.

## Permissions

| Action | Who |
| --- | --- |
| View active shifts/assignments | Active agency members (same agency) |
| View inactive shifts | Agency Admin / Command Staff |
| Create/update/deactivate/reactivate shifts | Agency Admin / Command Staff |
| Assign/remove personnel | Admin/Command, or Supervisors for shifts they supervise |
| Assign shift supervisors | Agency Admin / Command Staff |
| Self-assign / change own shift | Blocked for non-managers |

Writes go through SECURITY DEFINER RPCs with fixed `search_path`. Clients do not perform unrestricted inserts/updates.

## Legacy `shift_name` compatibility

`agency_members.shift_name` remains for compatibility with older roster/print/filter code.

- Relational primary assignments are preferred in new UI.
- Assigning/removing a primary assignment syncs `agency_members.shift_name` to the primary shift name (or null).
- Briefings still store `briefings.shift_name` as text; the create/edit UI selects from agency shifts (or custom) and writes the selected **name**.
- Briefing filter chips dedupe catalog + historical names with `normalizeShiftKey` (case/whitespace), preferring agency catalog labels.
- Optional historical cleanup SQL (not auto-run): `supabase/scripts/normalize_briefing_shift_names.sql`
- Future cleanup may add `briefings.shift_id` and deprecate free-text member `shift_name` after data backfill. Do not drop the column in this MVP.

## Printable shift roster

Web-only print from shift detail:

- Agency name, shift name/hours, supervisors
- Personnel name, rank/title, unit, badge, assignment type
- Printed date/time
- Current shift only

## Client architecture

- Types: `src/types/shifts.ts`
- Service: `src/services/shifts/`
- Screens:
  - `/personnel/shifts` list + desktop detail
  - `/personnel/shifts/[id]` mobile detail
- Personnel Directory tab **Shifts & Assignments** navigates to the shifts route
- Roster filters: All / Unassigned / active agency shifts
- Groups add-member picker can filter by shift (explicit select only)
- Home shows the viewer’s primary shift name and a briefings filter shortcut

## Current limitations

- No duty calendar, rotations, or “currently on duty” inference
- No overtime, leave, or timekeeping
- No automatic group membership from shift membership
- No certification/shift conflict engine
- Native print remains unavailable
- Supervisor assignment management requires the supervisor row on that shift

## Future scheduling / rotation support

- Recurring patterns and bid cycles
- Daily duty boards and relief swaps
- `briefings.shift_id` FK + historical name snapshot
- Push reminders for upcoming shift briefings
- On-duty status from clock-in / CAD integration
