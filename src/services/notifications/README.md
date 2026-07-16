# Notification Services

In-app notification helpers for agency-scoped alerts (briefings, groups, DMs, membership).

- List / unread count / mark read / delete
- Realtime subscription helpers (`subscribeToNotifications`)
- Creation happens in Postgres triggers/RPCs — clients never insert arbitrary notifications

Native push, email, and SMS are out of scope for this MVP. See `docs/NotificationsMVP.md`.
