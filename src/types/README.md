# Types

Shared TypeScript types and interfaces for users, roles, agencies, briefings, messages, and related domain models.

Prefer explicit types; avoid `any`.

## Agency membership

- `agency.ts` — hand-maintained `Agency`, `Profile`, `AgencyMember`, `AgencyRole`, and `MembershipStatus` types aligned to the SQL migration (not generated Supabase types).
