# Supabase Services

Supabase client setup and data-access helpers for agency-scoped queries.

## Environment variables

Required in `.env` (see `.env.example`):

- `EXPO_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the public/publishable anon key

Copy `.env.example` to `.env` and fill in values for local development. Never commit real secrets.

## Key policy

- Only the **public/publishable** key is permitted in this app.
- Privileged keys (service-role, database passwords, or any secret that bypasses RLS) must **never** be added to client code, app config, or Expo public env vars.
- The shared client lives in `client.ts` and is exported from `index.ts`.

## Row Level Security

Database access must be protected with Supabase Row Level Security. Apply migrations under `supabase/migrations/` before relying on membership queries.

Every operational record must include an `agency_id` where applicable, and users must only reach agencies and groups they are authorized to access.
