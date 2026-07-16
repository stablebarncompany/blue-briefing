# Services

Service-layer modules that talk to backends and platform APIs.

Subfolders:

- `auth` — authentication and sessions
- `supabase` — Supabase client and data access
- `notifications` — in-app notification inbox, unread counts, and Realtime helpers

Do not place secrets or service-role keys in client-reachable code.
