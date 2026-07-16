# Personnel and Invitations MVP

Agency administrators and command staff can invite users and manage membership for their active agency. Email delivery is manual in this phase.

Migrations (do not apply from the app):

- `supabase/migrations/20260716220000_personnel_invitations_mvp.sql`
- `supabase/migrations/20260716233000_personnel_invites_list_fix.sql`
- `supabase/migrations/20260716240000_agency_units.sql`

## Roles, titles, and units

Authorization uses only the official `agency_role` enum values:

- `agency_admin`
- `command_staff`
- `supervisor`
- `officer`
- `dispatcher`
- `civilian_staff`

These roles control permissions and RLS. There is no free-text authorization role, and no `other` enum value for `agency_role`.

**Titles / classifications** (`agency_members.title`) are display and organizational labels only. When inviting or editing a member, managers may choose **Other / Specialized Assignment**, then must still pick the closest official permission role and enter a custom title (for example Crime Analyst, Records Specialist, Telecommunicator). Custom titles never grant permissions.

**Units / divisions** are also organizational only. Suggested common divisions are available in the UI. Agencies can store configurable unit names in `agency_units` (unique per agency after trim/case normalization). Selecting **Other** requires a custom unit name; the custom value is saved (never the word “Other”). Whitespace is trimmed; blank custom values are rejected. Duplicate names that differ only by capitalization or spacing resolve to one agency unit row via `ensure_agency_unit`.

Roster filters use official roles (custom titles stay under their underlying role) and known units from active personnel plus agency-configured units. Custom unit names appear as their saved labels.

## Invitation lifecycle

1. An authorized manager calls `create_agency_invite` for their agency.
2. The database generates a cryptographically strong token, stores only `sha256(token)`, and returns the plain token once in the RPC response.
3. The app shows a **Copy invitation link** screen. The admin shares the link manually.
4. The invitee opens `/accept-invite` (deep link or pasted code), signs in with the invited email, and calls `accept_agency_invite`.
5. On success, membership becomes `active` with the invited role/unit/title/badge, and the invite status becomes `accepted`.
6. Pending invites may be `revoked` by managers, or treated as `expired` after `expires_at`.

Statuses: `pending` → `accepted` | `revoked` | `expired`.

## Role permissions

| Action | Who |
| --- | --- |
| View personnel (all statuses) | `agency_admin`, `command_staff` |
| Create / revoke invites | `agency_admin`, `command_staff` |
| Invite another `agency_admin` | `agency_admin` only |
| Update role / unit / title / badge | `agency_admin`, `command_staff` |
| Promote someone to `agency_admin` | `agency_admin` only |
| Suspend / reactivate / remove | `agency_admin`, `command_staff` |
| Normal members browse invites | No |

Supervisors are not personnel managers in this MVP.

## Manual link-sharing limitation

- The Expo client does **not** send invitation email.
- No email-provider API keys are stored in the app.
- UI label is **Copy invitation link**, never “email sent”.
- Future work: a Supabase Edge Function (or similar trusted server) can send email using the already-created invite record, without exposing secrets to the client.

## Secure token handling

- Plain tokens are generated server-side (`gen_random_bytes`).
- Only `token_hash` is stored.
- Column privileges hide `token_hash` from authenticated SELECT.
- Clients must not log tokens, persist them in SecureStore/AsyncStorage, or re-fetch them after the create response.
- Auth handoff uses an in-memory module (`inviteTokenSession`) only.

## Acceptance rules

- Caller must be authenticated.
- Token hash must match a pending, unexpired invite.
- Signed-in `auth.users.email` (normalized) must equal the invite email.
- Role/unit/title/badge come from the invite row — not from client-supplied values.
- Acceptance is idempotent for the same user/token (`already_accepted`).
- Revoked / expired / invalid / email mismatch return clear errors.

## Membership status behavior

| Status | Access |
| --- | --- |
| `active` | Full agency access (existing RLS helpers) |
| `suspended` | No active access; row retained |
| `removed` | No active access; row retained (not hard-deleted) |
| `pending` | No app access until activated (invite flow sets `active`) |

Managers can list suspended/removed members via dedicated SELECT policies.

## Final-admin protection

- Cannot demote, suspend, or remove the final active `agency_admin`.
- Users cannot change their own role.
- Users cannot suspend or remove themselves.

## Client architecture

- Types: `src/types/personnel.ts`
- Service: `src/services/personnel/`
- Screens:
  - More → **Manage personnel** → `/personnel`
  - `/personnel/invite`
  - `/personnel/[id]`
  - `/accept-invite` (available signed-out or signed-in)

## Database functions

- `create_agency_invite(...)`
- `accept_agency_invite(invite_token text)`
- `revoke_agency_invite(invite_id uuid)`
- `update_agency_membership(...)`
- `set_agency_membership_status(...)`
- `list_agency_invites(...)`
- `ensure_agency_unit(agency_id, name)` — create/reactivate normalized unit for managers
- `set_agency_unit_active(unit_id, is_active)` — deactivate/reactivate for managers
- Helpers: `can_manage_personnel`, `caller_is_agency_admin`, `count_active_agency_admins`, `hash_invite_token`, `normalize_invite_email`

All mutating invite/membership/unit paths are `SECURITY DEFINER` with fixed `search_path`.

## RLS summary

- `agency_invites`: SELECT for personnel managers of that agency; no client INSERT/UPDATE/DELETE.
- `agency_members`: additional SELECT for personnel managers (all statuses).
- `profiles`: additional SELECT for profiles of members in agencies the caller manages.
- `agency_units`: SELECT for active agency members (active units) and personnel managers; writes via RPCs only.
- Membership writes remain function-only (no direct client UPDATE policies).

## Current limitations

- No automated email delivery
- No push notifications for invites
- No advanced audit log UI
- No hard-delete of membership history
- Invitation plain token shown only once after create
- Supervisors cannot manage personnel in this MVP

## Future Edge Function / email plan

1. Keep `create_agency_invite` as the authoritative create path.
2. Add an Edge Function that accepts an invite id (authenticated manager JWT), loads the invite metadata, and sends email via a provider secret stored in Edge secrets.
3. Email contains the same accept URL the MVP copies manually.
4. Never return provider secrets or raw tokens to unrelated clients; optionally regenerate/send only through the function with rate limits.
