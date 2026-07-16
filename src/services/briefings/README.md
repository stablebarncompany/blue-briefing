# Briefings Services

Agency-scoped pass-on / briefing data access.

- Always pass `currentAgency.id` from `AgencyProvider` — never invent an agency id in the UI
- Authorization is enforced by Supabase RLS; UI only hides controls
- Do not log briefing bodies, tokens, or secrets
