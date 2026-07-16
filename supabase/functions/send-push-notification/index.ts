// Trusted push dispatcher for Blue Briefing.
// Secrets (service role, optional PUSH_DISPATCH_SECRET) stay server-side only.
// Deno runtime — deploy with: supabase functions deploy send-push-notification

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PUSHABLE_TYPES = new Set([
  'critical_briefing',
  'briefing_ack_required',
  'direct_message',
  'group_mention',
  'membership_updated',
  'membership_suspended',
  'membership_reactivated',
  'access_removed',
  'system',
]);

type Json = Record<string, unknown>;

type NotificationRow = {
  id: string;
  agency_id: string | null;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  push_status: string;
};

type DeviceRow = {
  id: string;
  expo_push_token: string;
  is_active: boolean;
};

type PreferenceRow = {
  critical_briefings: boolean;
  acknowledgement_requests: boolean;
  direct_messages: boolean;
  group_mentions: boolean;
  group_activity: boolean;
  membership_changes: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
};

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function preferenceAllows(type: string, prefs: PreferenceRow | null): boolean {
  if (!prefs) {
    // Defaults when preferences row is missing.
    return type !== 'group_post' && type !== 'group_reply' && type !== 'briefing_created' && type !== 'briefing_updated';
  }
  switch (type) {
    case 'critical_briefing':
      return prefs.critical_briefings;
    case 'briefing_ack_required':
      return prefs.acknowledgement_requests;
    case 'direct_message':
      return prefs.direct_messages;
    case 'group_mention':
      return prefs.group_mentions;
    case 'group_post':
    case 'group_reply':
      return prefs.group_activity;
    case 'membership_updated':
    case 'membership_suspended':
    case 'membership_reactivated':
    case 'access_removed':
      return prefs.membership_changes;
    case 'system':
      return true;
    default:
      return false;
  }
}

function inQuietHours(prefs: PreferenceRow | null, type: string): boolean {
  if (!prefs?.quiet_hours_enabled || !prefs.quiet_hours_start || !prefs.quiet_hours_end) {
    return false;
  }
  // Critical briefings ignore quiet hours in this MVP.
  if (type === 'critical_briefing') {
    return false;
  }

  try {
    const tz = prefs.timezone || 'UTC';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const current = `${hour}:${minute}`;
    const start = prefs.quiet_hours_start.slice(0, 5);
    const end = prefs.quiet_hours_end.slice(0, 5);

    if (start <= end) {
      return current >= start && current < end;
    }
    // Overnight window (e.g. 22:00–06:00)
    return current >= start || current < end;
  } catch {
    return false;
  }
}

function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service configuration.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveCallerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const jwt = authHeader.slice('Bearer '.length).trim();
  if (!jwt) {
    return null;
  }
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  if (!url || !anonKey) {
    return null;
  }
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user.id;
}

function isTrustedInternal(req: Request): boolean {
  const secret = Deno.env.get('PUSH_DISPATCH_SECRET') ?? '';
  if (!secret) {
    return false;
  }
  const provided = req.headers.get('x-push-secret') ?? '';
  return provided.length > 0 && provided === secret;
}

async function sendExpoPush(messages: Json[]): Promise<{ tickets: Json[]; invalidTokens: string[] }> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error('Expo Push API request failed.');
  }

  const payload = await response.json();
  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  const invalidTokens: string[] = [];

  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i] as Json;
    if (ticket?.status === 'error') {
      const details = ticket.details as Json | undefined;
      const errorCode = details?.error;
      if (errorCode === 'DeviceNotRegistered') {
        const token = messages[i]?.to;
        if (typeof token === 'string') {
          invalidTokens.push(token);
        }
      }
    }
  }

  return { tickets, invalidTokens };
}

async function dispatchNotification(
  service: ReturnType<typeof createServiceClient>,
  notification: NotificationRow,
): Promise<{ sent: number; skipped: boolean; reason?: string }> {
  if (!PUSHABLE_TYPES.has(notification.type) && notification.type !== 'system') {
    await service.rpc('mark_notification_push_skipped', {
      p_notification_id: notification.id,
      p_reason: 'type_not_pushable',
    });
    return { sent: 0, skipped: true, reason: 'type_not_pushable' };
  }

  if (notification.actor_id && notification.actor_id === notification.recipient_id) {
    await service.rpc('mark_notification_push_skipped', {
      p_notification_id: notification.id,
      p_reason: 'self_actor',
    });
    return { sent: 0, skipped: true, reason: 'self_actor' };
  }

  if (notification.push_status !== 'pending' && notification.push_status !== 'processing') {
    return { sent: 0, skipped: true, reason: 'already_processed' };
  }

  const { data: claimed } = await service.rpc('claim_notification_for_push', {
    p_notification_id: notification.id,
  });

  const claimedRow = claimed as NotificationRow | null;
  if (!claimedRow || claimedRow.push_status !== 'processing') {
    return { sent: 0, skipped: true, reason: 'claim_failed_or_duplicate' };
  }

  let prefs: PreferenceRow | null = null;
  if (notification.agency_id) {
    const { data: prefRows } = await service
      .from('notification_preferences')
      .select(
        'critical_briefings, acknowledgement_requests, direct_messages, group_mentions, group_activity, membership_changes, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone',
      )
      .eq('user_id', notification.recipient_id)
      .eq('agency_id', notification.agency_id)
      .maybeSingle();
    prefs = (prefRows as PreferenceRow | null) ?? null;
  }

  if (!preferenceAllows(notification.type, prefs)) {
    await service.rpc('mark_notification_push_skipped', {
      p_notification_id: notification.id,
      p_reason: 'preference_disabled',
    });
    return { sent: 0, skipped: true, reason: 'preference_disabled' };
  }

  if (inQuietHours(prefs, notification.type)) {
    await service.rpc('mark_notification_push_skipped', {
      p_notification_id: notification.id,
      p_reason: 'quiet_hours',
    });
    return { sent: 0, skipped: true, reason: 'quiet_hours' };
  }

  const { data: devices, error: deviceError } = await service
    .from('push_devices')
    .select('id, expo_push_token, is_active')
    .eq('user_id', notification.recipient_id)
    .eq('is_active', true);

  if (deviceError) {
    await service.rpc('mark_notification_push_failed', {
      p_notification_id: notification.id,
    });
    throw new Error('Unable to load device registrations.');
  }

  const activeDevices = ((devices ?? []) as DeviceRow[]).filter((d) => d.expo_push_token);
  if (activeDevices.length === 0) {
    await service.rpc('mark_notification_push_skipped', {
      p_notification_id: notification.id,
      p_reason: 'no_devices',
    });
    return { sent: 0, skipped: true, reason: 'no_devices' };
  }

  const messages = activeDevices.map((device) => ({
    to: device.expo_push_token,
    sound: 'default',
    title: notification.title,
    body: notification.body ?? undefined,
    data: {
      notificationId: notification.id,
      route: notification.route,
      entityType: notification.entity_type,
      entityId: notification.entity_id,
      type: notification.type,
    },
  }));

  try {
    const { invalidTokens } = await sendExpoPush(messages);

    for (const token of invalidTokens) {
      await service.rpc('deactivate_push_token_admin', {
        p_expo_push_token: token,
      });
    }

    await service.rpc('mark_notification_push_sent', {
      p_notification_id: notification.id,
    });

    return { sent: activeDevices.length - invalidTokens.length, skipped: false };
  } catch {
    await service.rpc('mark_notification_push_failed', {
      p_notification_id: notification.id,
    });
    throw new Error('Push dispatch failed.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    const mode = typeof body.mode === 'string' ? body.mode : 'dispatch';
    const notificationId = typeof body.notification_id === 'string' ? body.notification_id : null;
    const authHeader = req.headers.get('Authorization');
    const trusted = isTrustedInternal(req);
    const callerUserId = await resolveCallerUserId(authHeader);

    if (!trusted && !callerUserId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const service = createServiceClient();

    if (mode === 'test') {
      if (!callerUserId) {
        return jsonResponse({ error: 'Test mode requires a signed-in user.' }, 401);
      }

      const title = 'Blue Briefing test alert';
      const bodyText = 'This is a safe development test notification.';
      const { data: inserted, error: insertError } = await service
        .from('notifications')
        .insert({
          agency_id: null,
          recipient_id: callerUserId,
          actor_id: null,
          type: 'system',
          title,
          body: bodyText,
          entity_type: 'system',
          route: '/notifications',
          is_read: false,
          push_status: 'pending',
        })
        .select(
          'id, agency_id, recipient_id, actor_id, type, title, body, entity_type, entity_id, route, push_status',
        )
        .single();

      if (insertError || !inserted) {
        return jsonResponse({ error: 'Unable to create test notification.' }, 500);
      }

      const result = await dispatchNotification(service, inserted as NotificationRow);
      return jsonResponse({
        message: result.skipped
          ? `Test push skipped (${result.reason ?? 'unknown'}).`
          : `Test push sent to ${result.sent} device(s). Delivery is not guaranteed.`,
        sent: result.sent,
        skipped: result.skipped,
      });
    }

    // Production/internal dispatch by notification id.
    if (!notificationId) {
      return jsonResponse({ error: 'notification_id is required.' }, 400);
    }

    if (!trusted) {
      // Authenticated users may only dispatch their own pending notifications (rare);
      // preferred path is trusted internal secret from webhooks/cron.
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const { data: notification, error } = await service
      .from('notifications')
      .select(
        'id, agency_id, recipient_id, actor_id, type, title, body, entity_type, entity_id, route, push_status',
      )
      .eq('id', notificationId)
      .maybeSingle();

    if (error || !notification) {
      return jsonResponse({ error: 'Notification not found.' }, 404);
    }

    const result = await dispatchNotification(service, notification as NotificationRow);
    return jsonResponse({
      message: result.skipped
        ? `Push skipped (${result.reason ?? 'unknown'}).`
        : `Push sent to ${result.sent} device(s).`,
      sent: result.sent,
      skipped: result.skipped,
      reason: result.reason ?? null,
    });
  } catch {
    return jsonResponse({ error: 'Unable to process push request.' }, 500);
  }
});
