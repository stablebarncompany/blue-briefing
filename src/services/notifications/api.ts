import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';
import type {
  AppNotification,
  NotificationFilters,
  NotificationSummary,
  NotificationType,
} from '@/types/notifications';
import { isNotificationType } from '@/types/notifications';

export class NotificationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

function mapNotification(row: Record<string, unknown>): AppNotification {
  const type = String(row.type);
  if (!isNotificationType(type)) {
    throw new NotificationServiceError('Received an invalid notification type from the server.');
  }

  return {
    id: String(row.id),
    agency_id: row.agency_id == null ? null : String(row.agency_id),
    recipient_id: String(row.recipient_id),
    actor_id: row.actor_id == null ? null : String(row.actor_id),
    type,
    title: String(row.title),
    body: row.body == null ? null : String(row.body),
    entity_type: row.entity_type == null ? null : String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    route: row.route == null ? null : String(row.route),
    is_read: Boolean(row.is_read),
    read_at: row.read_at == null ? null : String(row.read_at),
    created_at: String(row.created_at),
    expires_at: row.expires_at == null ? null : String(row.expires_at),
  };
}

export async function listNotifications(
  filters: NotificationFilters = {},
): Promise<AppNotification[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);

  let query = supabase
    .from('notifications')
    .select(
      'id, agency_id, recipient_id, actor_id, type, title, body, entity_type, entity_id, route, is_read, read_at, created_at, expires_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filters.unreadOnly) {
    query = query.eq('is_read', false);
  }

  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type);
  }

  if (filters.agencyId) {
    query = query.eq('agency_id', filters.agencyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new NotificationServiceError(error.message || 'Unable to load notifications.');
  }

  return (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
}

export async function getUnreadNotificationCount(agencyId?: string | null): Promise<number> {
  let query = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  const { count, error } = await query;

  if (error) {
    throw new NotificationServiceError(error.message || 'Unable to load unread notification count.');
  }

  return count ?? 0;
}

export async function getNotificationSummary(
  agencyId?: string | null,
): Promise<NotificationSummary> {
  const unreadCount = await getUnreadNotificationCount(agencyId);
  return { unreadCount };
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
  if (!notificationId) {
    throw new NotificationServiceError('Notification id is required.');
  }

  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });

  if (error) {
    // Fallback to direct update when RPC is unavailable (pre-migration).
    const { data: updated, error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select(
        'id, agency_id, recipient_id, actor_id, type, title, body, entity_type, entity_id, route, is_read, read_at, created_at, expires_at',
      )
      .maybeSingle();

    if (updateError || !updated) {
      throw new NotificationServiceError(error.message || 'Unable to mark notification as read.');
    }
    return mapNotification(updated as Record<string, unknown>);
  }

  return mapNotification(data as Record<string, unknown>);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');

  if (error) {
    const { data: updatedRows, error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false)
      .select('id');

    if (updateError) {
      throw new NotificationServiceError(error.message || 'Unable to mark all notifications as read.');
    }
    return updatedRows?.length ?? 0;
  }

  return typeof data === 'number' ? data : Number(data ?? 0);
}

export async function deleteNotification(notificationId: string): Promise<void> {
  if (!notificationId) {
    throw new NotificationServiceError('Notification id is required.');
  }

  const { error } = await supabase.rpc('delete_own_notification', {
    p_notification_id: notificationId,
  });

  if (error) {
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (deleteError) {
      throw new NotificationServiceError(error.message || 'Unable to delete notification.');
    }
  }
}

export type NotificationSubscriptionHandlers = {
  onChange: () => void;
  onError?: (message: string) => void;
};

type RecipientRealtimeEntry = {
  channel: RealtimeChannel | null;
  starting: Promise<RealtimeChannel | null>;
  changeListeners: Set<() => void>;
  errorListeners: Set<(message: string) => void>;
  refCount: number;
};

const recipientRealtime = new Map<string, RecipientRealtimeEntry>();

function notificationChannelTopic(recipientId: string): string {
  return `notifications:${recipientId}`;
}

function matchesNotificationTopic(channelTopic: string, recipientId: string): boolean {
  const topic = notificationChannelTopic(recipientId);
  return channelTopic === topic || channelTopic.endsWith(`:${topic}`) || channelTopic.includes(topic);
}

async function removeExistingNotificationChannels(recipientId: string): Promise<void> {
  const existing = supabase
    .getChannels()
    .filter((channel) => matchesNotificationTopic(channel.topic, recipientId));

  await Promise.all(existing.map((channel) => supabase.removeChannel(channel)));
}

function warnRealtimeFailure(): void {
  if (__DEV__) {
    // Safe: no user ids, tokens, or notification bodies.
    console.warn('[notifications] Realtime subscription unavailable; falling back to refresh.');
  }
}

/**
 * Exactly one Realtime channel per authenticated recipient.
 * Multiple callers share the same channel via ref-counted listeners.
 * Returns an unsubscribe function (never add .on() after subscribe).
 */
export function subscribeToNotifications(
  recipientId: string,
  handlers: NotificationSubscriptionHandlers,
): () => void {
  const scopedRecipientId = recipientId.trim();
  if (!scopedRecipientId) {
    throw new NotificationServiceError('Recipient id is required for notification subscription.');
  }

  let entry = recipientRealtime.get(scopedRecipientId);

  if (!entry) {
    const changeListeners = new Set<() => void>();
    const errorListeners = new Set<(message: string) => void>();
    const created: RecipientRealtimeEntry = {
      channel: null,
      starting: Promise.resolve(null),
      changeListeners,
      errorListeners,
      refCount: 0,
    };

    created.starting = (async (): Promise<RealtimeChannel | null> => {
      try {
        await removeExistingNotificationChannels(scopedRecipientId);

        // Abort if Strict Mode cleaned up or replaced this registry entry.
        if (recipientRealtime.get(scopedRecipientId) !== created || created.refCount <= 0) {
          return null;
        }

        const channel = supabase.channel(notificationChannelTopic(scopedRecipientId));

        // Attach handlers before subscribe — never call .on() after subscribe().
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${scopedRecipientId}`,
          },
          () => {
            for (const listener of changeListeners) {
              try {
                listener();
              } catch {
                // Listener errors must not tear down the shared channel.
              }
            }
          },
        );

        channel.subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            warnRealtimeFailure();
            for (const listener of errorListeners) {
              listener('Notification realtime unavailable.');
            }
          }
        });

        if (recipientRealtime.get(scopedRecipientId) !== created || created.refCount <= 0) {
          void supabase.removeChannel(channel);
          return null;
        }

        created.channel = channel;
        return channel;
      } catch {
        warnRealtimeFailure();
        for (const listener of errorListeners) {
          listener('Notification realtime unavailable.');
        }
        return null;
      }
    })();

    entry = created;
    recipientRealtime.set(scopedRecipientId, entry);
  }

  const onChange = () => {
    handlers.onChange();
  };
  const onError = handlers.onError
    ? (message: string) => {
        handlers.onError?.(message);
      }
    : null;

  entry.changeListeners.add(onChange);
  if (onError) {
    entry.errorListeners.add(onError);
  }
  entry.refCount += 1;

  let active = true;

  return () => {
    if (!active) {
      return;
    }
    active = false;

    const current = recipientRealtime.get(scopedRecipientId);
    if (!current) {
      return;
    }

    current.changeListeners.delete(onChange);
    if (onError) {
      current.errorListeners.delete(onError);
    }
    current.refCount -= 1;

    if (current.refCount > 0) {
      return;
    }

    recipientRealtime.delete(scopedRecipientId);
    void current.starting.then((channel) => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    });
    void removeExistingNotificationChannels(scopedRecipientId);
  };
}

/** @deprecated Prefer the cleanup function returned by subscribeToNotifications. */
export async function unsubscribeFromNotifications(
  cleanupOrChannel?: (() => void) | RealtimeChannel | null,
) {
  if (!cleanupOrChannel) {
    return;
  }
  if (typeof cleanupOrChannel === 'function') {
    cleanupOrChannel();
    return;
  }
  await supabase.removeChannel(cleanupOrChannel);
}

export type { NotificationType };
