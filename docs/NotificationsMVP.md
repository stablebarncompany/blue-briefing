# Notifications MVP

Agency-scoped in-app notifications with truthful unread counts. Native push foundation is documented in `docs/PushNotificationsMVP.md` (device registration + Edge Function; not auto-deployed).

Migration (do not apply from the app):

`supabase/migrations/20260716250000_notifications_mvp.sql`

## Notification types

| Type | Typical trigger |
| --- | --- |
| `critical_briefing` | Critical briefing created, or priority raised to critical |
| `briefing_created` | Non-critical active briefing created (no ack required) |
| `briefing_updated` | Active briefing title/body/priority changed |
| `briefing_ack_required` | Briefing requires acknowledgement |
| `group_post` | New group post (no `@All`) |
| `group_mention` | Group post containing `@All` |
| `group_reply` | Reply on a post (post author + prior participants) |
| `direct_message` | New DM to the other conversation member |
| `agency_invitation` | Invite created for an email that already has a profile |
| `membership_updated` | Role/unit/title/badge change for the member |
| `membership_suspended` | Membership status → suspended |
| `membership_reactivated` | Membership status → active from suspended/removed/pending |
| `access_removed` | Membership status → removed |
| `system` | Reserved for trusted system notices |

## Recipient rules

- Every row is for a single `recipient_id`.
- Actors never receive a notification for their own action.
- Briefings notify **active** agency members only (except the author).
- Group posts/replies notify **group members** only (except the author).
- Direct messages notify only the other conversation member(s), skipping muted memberships.
- Membership and access notifications go only to the affected member.
- Agency invitations notify an existing user matched by normalized profile email when present.
- No agency admin blanket access to another user’s inbox.
- No cross-agency visibility via RLS (`recipient_id = auth.uid()`).

## Duplicate prevention

- Unique partial index on unread `(recipient_id, type, entity_id)`.
- Insert helper catches unique violations.
- DM and group-reply helpers can coalesce an existing unread row for the same entity (refresh title/body/timestamp) instead of stacking duplicates.
- Briefing create emits **one** type per recipient (critical → ack required → created priority).

## Unread behavior

- `is_read` defaults to `false`.
- Marking read sets `read_at`; restoring unread clears `read_at`.
- Client helpers: `mark_notification_read`, `mark_all_notifications_read`, `delete_own_notification`.
- TopBar badge and Home “Unread notifications” use live counts (never fabricated).
- Selecting a notification marks it read, then navigates via `route` when present.

## Privacy model

- Clients cannot insert arbitrary notifications (no INSERT policy; create helper not granted to `authenticated`).
- Clients may SELECT/UPDATE/DELETE only their own rows; updates are limited to read-state by trigger.
- Notification creation runs in `SECURITY DEFINER` helpers/triggers with `SET search_path = public` (or `public, extensions` for invite).
- DM notification bodies may include a short preview intended **only for the recipient**. Do not log bodies, tokens, or private message contents in the client.
- Reading a notification is **not** a DM read receipt. Message read tracking is not implemented in this MVP.

## Realtime behavior

- `notifications` is added to `supabase_realtime` when the publication exists.
- Client subscribes with `recipient_id=eq.<userId>` and refreshes list/badge counts.
- Channels are removed on unmount (`unsubscribeFromNotifications`).

## Current limitation

In-app inbox only. No native push, email, or SMS delivery.

## Future native push plan

1. Keep Postgres as the source of truth for notification rows and unread state.
2. Add a trusted Edge Function (or queue worker) that listens to notification inserts and sends device push via APNs/FCM using server secrets.
3. Store device tokens in a separate table with RLS (user owns their tokens only).
4. Respect mute/preferences before push fan-out.
5. Never move authorization into the push provider — RLS and recipient scoping remain authoritative.
