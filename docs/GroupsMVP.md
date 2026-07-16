# Groups MVP

Invite-only agency channels for shift coordination and threaded discussion.

## Tables

### `public.groups`

Agency-scoped channel metadata. Unique `(agency_id, name)`. Defaults to private/invite-only.

### `public.group_members`

Membership rows with optional `is_moderator`. Unique `(group_id, user_id)`. Creator is auto-added as moderator via trigger.

### `public.group_posts`

Member posts. Sorted pinned first, then newest.

### `public.group_post_replies`

Threaded replies under a post.

Migration (do not apply from the app):

`supabase/migrations/20260716180000_groups_mvp.sql`

## Privacy model

- Groups are invite-only by default (`is_private = true`).
- Users only see groups they belong to.
- Normal users cannot self-join.
- Membership assignments must target active members of the same agency.

## Membership rules

| Action | Who |
| --- | --- |
| View own groups | Group members |
| Create group | Supervisor / command staff / agency admin |
| Update group details | Creator, moderators, agency admin, command staff |
| Archive / delete group | Agency admin / command staff |
| Add / remove members | Moderators, supervisors, command staff, agency admin |
| Assign moderator | Same as member managers |

Cross-agency membership inserts are blocked by RLS helpers.

## Moderation permissions

| Action | Who |
| --- | --- |
| Pin / moderate posts | Moderators, supervisors, command staff, agency admin |
| Delete post | Author, moderators, agency admin, command staff |
| Delete reply | Author, or group content moderators |

## Posting and replies

- Group members may create posts and replies (`author_id = auth.uid()`).
- Authors may edit their own posts/replies.
- `@All` is a text convention only in MVP — no notifications are sent.
- Feeds sort pinned posts first, then newest first.

## Client architecture

- Types: `src/types/groups.ts`
- Service: `src/services/groups/`
- Screens:
  - `/groups` list (desktop two-pane, mobile stacked)
  - `/groups/create`
  - `/groups/[id]` detail/feed

## Current limitations

- No group attachments yet
- No push/email notifications for `@All` or new posts
- No public/discoverable agency groups
- No soft-delete audit trail UI
- Duplicate group names blocked per agency (exact name match)

## Future support

1. Group post attachments using the private storage pattern from briefings
2. Real notification fan-out for `@All` and mentions
3. Read receipts / unread counts
4. Richer moderation audit logs
