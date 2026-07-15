# Auth Services

Authentication and session-related service modules (sign-in, sign-out, session refresh).

Do not place service-role keys or database passwords in client code.

Agency membership and authorization live in `src/services/agency` and Supabase RLS — not in user metadata.

## Current phase

- Email/password auth via the shared Supabase client
- Session persistence handled by that client (SecureStore on native, localStorage on web)
- User metadata stores `first_name` and `last_name` only for profile bootstrap
- Route access after sign-in depends on active `agency_members` rows enforced by RLS
