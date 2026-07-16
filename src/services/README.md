# Services

Service-layer modules that talk to backends and platform APIs.

Subfolders:

- `auth` — authentication and sessions
- `supabase` — Supabase client and data access
- `notifications` — in-app notification inbox, unread counts, and Realtime helpers
- `push-notifications` — Expo device registration, preferences, and deep-link helpers (no service-role keys)

Do not place secrets or service-role keys in client-reachable code.
