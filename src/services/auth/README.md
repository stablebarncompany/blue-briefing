# Auth Services

Authentication and session-related service modules (sign-in, sign-out, session refresh, and role/agency context helpers).

Do not place service-role keys or database passwords in client code.

## Current phase

- Email/password auth via the shared Supabase client in `src/services/supabase`
- Session persistence handled by that client (SecureStore on native, localStorage on web)
- User metadata stores `first_name` and `last_name` only — no public profile table yet
- `hasAgencyAccess` is always `false` until agency membership is implemented

## Files

- `AuthProvider.tsx` — session bootstrap, auth-state subscription, auth actions
- `validation.ts` — client-side form validation helpers
- `errors.ts` — user-facing auth error mapping (never log secrets)
- `types.ts` — shared auth types
