# Agency Services

Agency membership context for authenticated users.

- Loads profile and membership rows through the shared Supabase client
- Relies on Row Level Security for authorization — never trusts client-supplied agency or role claims
- `hasAgencyAccess` is derived from active memberships in the UI/guards, not from user metadata
- Membership administration (insert/update/delete) is intentionally blocked for normal clients

## Files

- `AgencyProvider.tsx` — membership state and agency selection
- `api.ts` — profile and membership queries
- `storage.ts` — persisted selected agency id (SecureStore / localStorage)
