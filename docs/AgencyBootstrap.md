# Agency Bootstrap (manual)

Use this process only in development to attach a test account to an agency after the membership migration is applied. There is no public self-service agency registration.

Never put real user UUIDs, emails, passwords, or API keys in this document or in committed SQL.

## Prerequisites

1. Apply `supabase/migrations/20260715180000_agency_membership_foundation.sql` in the Supabase SQL Editor (or via the Supabase CLI against your project).
2. Confirm Row Level Security is enabled on `agencies`, `profiles`, and `agency_members`.
3. Create a test account in the Expo app (Create account → confirm email if required → sign in).

## Steps

### 1. Create a test account in the app

Use the Create account screen. First and last name are stored in auth user metadata and copied into `public.profiles` by the signup trigger.

### 2. Find the user UUID

In the Supabase dashboard:

1. Open **Authentication → Users**
2. Select the test user
3. Copy the user **UUID**

You will substitute it for `YOUR_USER_UUID` below.

### 3. Insert a test agency

In the SQL Editor, run (edit placeholders first):

```sql
insert into public.agencies (id, name, slug, is_active, created_by)
values (
  gen_random_uuid(),
  'YOUR_AGENCY_NAME',
  'YOUR_AGENCY_SLUG',
  true,
  'YOUR_USER_UUID'::uuid
)
returning id, name, slug;
```

Copy the returned agency `id` for the next step (`YOUR_AGENCY_ID`).

### 4. Insert an active agency_admin membership

```sql
insert into public.agency_members (
  agency_id,
  user_id,
  role,
  status,
  badge_number,
  unit,
  title,
  joined_at
)
values (
  'YOUR_AGENCY_ID'::uuid,
  'YOUR_USER_UUID'::uuid,
  'agency_admin',
  'active',
  null,
  null,
  'Agency Administrator',
  now()
)
returning id, agency_id, user_id, role, status;
```

Notes:

- Normal authenticated clients cannot insert memberships; this SQL must be run with a privileged dashboard/SQL role.
- Do not grant the Expo app a service-role key.

### 5. Refresh the app

Sign out and sign back in, or use **Refresh membership** on the pending-access screen if you are already signed in.

Expected result:

- One active membership → enter the protected app shell
- Multiple active memberships → agency selection screen first
- Top bar shows the agency name and **Agency Secure**

## Verification queries (optional)

```sql
select id, email, first_name, last_name, display_name
from public.profiles
where id = 'YOUR_USER_UUID'::uuid;

select m.id, m.role, m.status, a.name as agency_name
from public.agency_members m
join public.agencies a on a.id = m.agency_id
where m.user_id = 'YOUR_USER_UUID'::uuid;
```

## Security reminders

- Agency isolation is enforced by RLS policies and helper functions, not by UI alone.
- Users cannot self-assign an agency or elevate their role from the client.
- Membership administration belongs in a trusted server-side workflow in a later phase.
