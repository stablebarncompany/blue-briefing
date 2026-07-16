# Push Notifications MVP (Foundation)

Secure foundation for native Expo push on iOS and Android. Production fan-out is prepared but not auto-deployed. Web continues to use in-app notifications only.

Migration (do not apply from the app):

`supabase/migrations/20260716260000_push_notifications_foundation.sql`

Edge Function (do not deploy from the app):

`supabase/functions/send-push-notification/`

## Device registration

1. User opens **Personnel → Account → Notifications & Alerts**.
2. Taps **Enable device notifications** (explicit action — no silent permission spam).
3. App requests OS permission once; if denied, it does not re-prompt and offers **Open device settings**.
4. On a physical device with an EAS `projectId`, the app obtains an Expo push token and upserts `push_devices` via `upsert_push_device`.
5. Registration associates the selected agency when available.
6. On sign-out, the client deactivates the current user’s device rows (`deactivate_push_device` / `deactivate_my_push_devices`).

Simulators/emulators without push support show a clear unavailable message. Full tokens are never displayed (fingerprint only in development registration results).

## Notification permissions

- Request only after user action.
- Android channel `blue-briefing-alerts` is created before token fetch.
- Denied permission → settings deep link when supported.
- Web → unsupported (in-app inbox only).

## Preference behavior

Per user + agency (`notification_preferences`):

| Preference | Default | Push types |
| --- | --- | --- |
| Critical briefings | on | `critical_briefing` |
| Acknowledgement requests | on | `briefing_ack_required` |
| Direct messages | on | `direct_message` |
| Group mentions / @All | on | `group_mention` |
| General group activity | **off** | `group_post`, `group_reply` (not pushed in MVP unless enabled) |
| Membership / access changes | on | membership_* / `access_removed` |
| Quiet hours | off | Suppresses non-critical pushes in the configured local window |

Critical briefings ignore quiet hours in this MVP. Preferences do not grant permissions — they only filter delivery.

## Edge Function architecture

`send-push-notification`:

- Runs on Supabase (Deno). Uses **service role** only in the function environment.
- **Test mode:** authenticated user JWT + `{ "mode": "test" }` → creates a `system` notification for the caller and dispatches only to that user.
- **Dispatch mode:** `{ "notification_id": "..." }` + `x-push-secret: PUSH_DISPATCH_SECRET` (trusted webhook/cron). Authenticated clients cannot dispatch arbitrary notification IDs.
- Loads recipient devices, checks preferences, builds Expo Push API payload (`title`, `body`, `data.route`, entity metadata).
- Claims notification (`pending` → `processing`) for idempotency; marks `sent` / `skipped` / `failed`.
- Deactivates tokens that Expo reports as `DeviceNotRegistered`.
- Returns safe summaries (no tokens, no secrets).

## Supported push types (MVP)

- `critical_briefing`
- `briefing_ack_required`
- `direct_message`
- `group_mention`
- `membership_updated`
- `membership_suspended`
- `membership_reactivated`
- `access_removed`
- `system` (test / trusted system notices)

Ordinary group posts are not pushed by default.

## Deep links

Push `data.route` must match an allowlist (`/briefings/…`, `/groups/…`, `/messages/…`, `/notifications`, `/personnel…`, `/accept-invite`). Arbitrary URLs are ignored. Pending routes can be consumed after authentication. Access checks remain with existing RLS when the destination loads.

## Physical-device testing

1. Apply the migration in Supabase.
2. `eas init` and set `extra.eas.projectId` in `app.json`.
3. Configure EAS credentials (APNs + FCM).
4. Deploy the Edge Function and set secrets.
5. Install a **development or production build** on a physical device (Expo Go is limited for Android remote push on recent SDKs).
6. Sign in → Account → Enable device notifications → **Send test push to me** (`__DEV__` only).

Web browser testing cannot validate native push delivery.

## EAS credential requirements

- Expo / EAS project ID
- iOS push key / certificates via EAS
- Android FCM credentials via EAS (`google-services.json` when you add it — not committed with secrets)
- Rebuild native binaries after plugin changes

## Invalid-token cleanup

Expo ticket errors with `DeviceNotRegistered` cause `deactivate_push_token_admin` so the token stops receiving sends.

## Current limitations

- No automatic DB webhook is installed yet — wire `notifications` INSERT → Edge Function manually for production fan-out.
- Delivery is **not guaranteed** (OS battery policies, connectivity, user settings, Expo/APNs/FCM).
- No SMS/email fallback.
- Quiet hours use preference timezone text; invalid timezones fail open (no suppression).
- Empty `extra.eas.projectId` until you run EAS init — registration explains the missing ID.

## Privacy

- Clients cannot read other users’ push tokens (RLS owner-only).
- No agency-admin blanket token access.
- Service role used only inside the Edge Function.
- Do not log full tokens, sessions, notification bodies, or keys in the client.
