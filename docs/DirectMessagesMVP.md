# Direct Messages MVP

Agency-scoped secure one-to-one messaging between active agency members.

## Table model

### `public.conversations`

Conversation header. Includes `participant_pair_key` (`lowerUserId:higherUserId`) unique per agency to prevent duplicate 1:1 threads.

### `public.conversation_members`

Exactly two membership rows per conversation. Per-user `is_archived` and `is_muted` preferences.

### `public.direct_messages`

Message body, sender, timestamps, optional `deleted_at` soft delete.

Migration (do not apply from the app):

`supabase/migrations/20260716200000_direct_messages_mvp.sql`

## One-to-one restriction

- Trigger blocks inserting a third membership row.
- Conversations and members are created only through `start_direct_conversation`.
- No client INSERT policies on `conversations` or `conversation_members`.

## Agency isolation

- Every row includes `agency_id`.
- Conversations may be started only when both users are active members of the selected agency.
- Cross-agency membership assignment is rejected by the creation function and helpers.

## Conversation creation function

```sql
start_direct_conversation(target_agency_id uuid, other_user_id uuid) returns uuid
```

Behavior:

- Uses `auth.uid()` as the current user
- Rejects self-messaging
- Confirms both users are active in `target_agency_id`
- Returns the existing conversation when the pair already exists
- Otherwise creates the conversation and exactly two membership rows
- `SECURITY DEFINER` with fixed `search_path = public`
- No role escalation path and no admin bypass into arbitrary conversations

## Privacy model

- Users see only conversations they belong to
- Users see only messages in conversations they belong to
- Agency administrators do **not** receive blanket DM read access from role alone
- Not end-to-end encrypted
- Do not claim evidence-chain or E2EE guarantees

## Archive and mute

- Each user updates only their own membership row
- Archive/mute affect only that user’s conversation list preference
- Trigger prevents changing identity columns on membership updates

## Soft deletion and edit window

- Authors may soft-delete their own messages (`deleted_at`)
- Authors may edit own non-deleted messages for 15 minutes
- UI shows “Message deleted” placeholder for soft-deleted messages

## Realtime

- Thread screen subscribes to `direct_messages` for the selected `conversation_id` only
- Subscription is removed on conversation change / unmount
- Reload on change avoids duplicate optimistic rows when IDs match
- If Realtime is unavailable in an environment, pull-to-focus refresh still works

## Client architecture

- Types: `src/types/messages.ts`
- Service: `src/services/messages/`
- Screens:
  - `/messages` list (desktop two-pane, mobile stack)
  - `/messages/new`
  - `/messages/[id]`

## Current limitations

- No attachments
- No typing indicators
- No delivery/read receipts (Home does not show fabricated unread DM counts)
- No group chats
- No push notifications
- No disappearing messages
- No message forwarding

## Future support

1. Attachments via private storage + signed URLs
2. Read receipts / unread counts
3. Typing indicators
4. Push notifications for muted/unmuted preferences
5. Optional disappearing messages with clear retention policy
