# Supabase Edge Functions

## send-push-notification

Trusted dispatcher for Expo push notifications.

### Secrets (server only)

- `SUPABASE_URL` (usually provided)
- `SUPABASE_SERVICE_ROLE_KEY` (never in Expo client)
- `SUPABASE_ANON_KEY` or publishable key (for validating user JWTs in test mode)
- `PUSH_DISPATCH_SECRET` (shared secret for internal/webhook dispatch)

### Deploy (manual)

```bash
supabase functions deploy send-push-notification
supabase secrets set PUSH_DISPATCH_SECRET=your-long-random-secret
```

### Invoke

- **Test (signed-in user):** `{ "mode": "test" }` with user JWT — sends only to the caller.
- **Dispatch:** `{ "notification_id": "<uuid>" }` with header `x-push-secret: <PUSH_DISPATCH_SECRET>`.

Wire a Database Webhook or cron on `notifications` inserts (pending + pushable types) to call this function. Do not expose the service role or dispatch secret to the Expo app.
