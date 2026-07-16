# Groups Services

Invite-only agency channel data access.

- Always pass `currentAgency.id` from `AgencyProvider`
- Membership and posting are enforced by Supabase RLS
- Do not log post bodies, tokens, or secrets
