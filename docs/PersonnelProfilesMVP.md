# Personnel Profiles MVP

Agency directory and detailed personnel profiles for Blue Briefing. Extends global identity fields and agency-scoped employment data without scheduling, payroll, or training workflows.

Migration (do not apply from the app):

`supabase/migrations/20260716270000_personnel_profiles_mvp.sql`

## Global profile vs agency membership

| Concern | Storage | Notes |
| --- | --- | --- |
| Preferred name, pronouns, phones, avatar path | `public.profiles` | User-global identity; one person may join multiple agencies later |
| Rank, title, unit, shift, supervisor, badge, employee number, hire date, employment type, callsign, radio, status notes | `public.agency_members` | Agency-scoped employment; never store only on `profiles` |
| Certifications | `public.personnel_certifications` | Agency + user scoped |
| Emergency contacts | `public.personnel_emergency_contacts` | Agency + user scoped; restricted RLS |

Official authorization roles remain on `agency_members.role` and continue to use existing secure membership RPCs. Clients must not self-promote or reassign agencies via unrestricted table updates.

## Visibility rules

- Active agency members may view basic profile and active membership information for members of the **same** agency.
- No cross-agency directory or profile visibility.
- Users may update their own permitted personal fields via `update_own_personnel_profile`.
- Agency Admin and Command Staff may update employment/assignment fields via `update_agency_employment`.
- Role changes stay on existing `update_agency_membership` (or equivalent) secure functions.
- Auth email (`auth.users`) is not editable from the client.

## Avatar privacy

Bucket: `personnel-avatars` (private).

- Image MIME types only; 5 MB max.
- Path shape: `agency_id/user_id/<generated-file-name>.ext`
- Members upload/replace their own avatar; Agency Admin / Command Staff may manage agency member avatars.
- Active agency members may create **signed** URLs for same-agency avatars.
- No public bucket and no permanent public URLs.

## Certification permissions

Statuses: `active`, `expiring`, `expired`, `suspended`, `revoked`.

- Client computes display status from expiration date when practical (expiring within 90 days, expired, or no expiration).
- Member may view their own certifications.
- Agency Admin, Command Staff, and Supervisors may view same-agency certifications.
- Agency Admin and Command Staff may create/update/delete.
- Normal members cannot edit another member’s certifications.
- No certification reminder notifications in this MVP; data is structured for future reminders.

## Emergency-contact privacy

Restricted to:

- the member themself
- Agency Admin
- Command Staff

General directory users must not see emergency contacts. Printable rosters never include emergency-contact data.

## Print limitations

Web-only print modes:

1. Basic roster
2. Contact roster
3. Assignment roster

Print includes agency name and printed date, respects current filters, and omits app chrome. Native platforms keep print hidden/unavailable for MVP.

## Client architecture

- Types: `src/types/personnelProfiles.ts` (+ directory fields on `src/types/personnel.ts`)
- Service: `src/services/personnel-profiles/`
- Shared display: `PersonnelIdentity` + `listPersonnelIdentitySummaries`
- Routes:
  - `/personnel` agency directory
  - `/personnel/[userId]` profile (param is **user id**, not membership id)

Messages, Groups, and Briefings load author/member identity through the shared helper so rank/title/unit/avatar stay consistent.

## Current MVP limitations

- No shift scheduling, timekeeping, or payroll
- No training workflows or automated certification notifications
- Supervisor limited employment edits only if already granted by the permission model (MVP manage path is admin/command for employment RPCs)
- Print is web-only
- Mobile phone visibility follows current permission flags from the profile service
- Avatar signed URLs expire; clients must refresh when needed

## Future integration

- Shift scheduling tied to `shift_name` / unit assignment
- Training and certification renewal reminders
- Multi-agency profile switching with per-agency employment overlays
- Richer supervisor picker and org-chart views
