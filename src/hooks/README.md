# Hooks

Reusable React hooks for shared client behavior (theme access, responsive layout helpers, auth, and agency membership).

Prefer small, single-purpose hooks over large combined hooks.

## Auth and agency

- `use-auth.ts` — session, user, loading, and auth actions from `AuthProvider`
- `use-agency.ts` — profile, memberships, current agency selection from `AgencyProvider`
