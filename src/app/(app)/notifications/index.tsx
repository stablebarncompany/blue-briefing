import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { type Href, router, useFocusEffect } from 'expo-router';

import {
  NotificationCard,
  NotificationFiltersBar,
} from '@/components/notifications';
import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useNotificationBadge } from '@/hooks/use-notification-badge';
import {
  NotificationServiceError,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '@/services/notifications';
import { colors, spacing } from '@/theme';
import type { AppNotification, NotificationType } from '@/types/notifications';

export default function NotificationsScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentAgency } = useAgency();
  const { unreadCount, refresh: refreshBadge } = useNotificationBadge();
  const userId = user?.id ?? null;
  const agencyId = currentAgency?.id ?? null;

  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<NotificationType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rows = await listNotifications({
        unreadOnly,
        type,
        agencyId,
      });
      setItems(rows);
    } catch (error) {
      setItems([]);
      setErrorMessage(
        error instanceof NotificationServiceError
          ? error.message
          : 'Unable to load notifications.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, type, unreadOnly, userId]);

  const loadRef = useRef(load);
  const refreshBadgeRef = useRef(refreshBadge);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    refreshBadgeRef.current = refreshBadge;
  }, [refreshBadge]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void loadRef.current();
          void refreshBadgeRef.current();
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useEffect(() => {
    if (authLoading || !userId) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToNotifications(userId, {
        onChange: () => {
          void loadRef.current();
          void refreshBadgeRef.current();
        },
        onError: () => {
          // Keep inbox usable via focus/manual refresh; do not crash the screen.
          if (__DEV__) {
            console.warn('[notifications] Inbox realtime unavailable.');
          }
        },
      });
    } catch {
      if (__DEV__) {
        console.warn('[notifications] Inbox realtime subscribe failed.');
      }
    }

    return () => {
      unsubscribe?.();
    };
  }, [authLoading, userId]);

  async function onOpenNotification(notification: AppNotification) {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (!notification.is_read) {
        await markNotificationRead(notification.id);
        await refreshBadge();
      }

      const route = notification.route?.trim();
      if (!route) {
        setInfoMessage('This notification has no linked destination.');
        await load();
        return;
      }

      router.push(route as Href);
    } catch (error) {
      setErrorMessage(
        error instanceof NotificationServiceError
          ? error.message
          : 'Unable to open this notification. The related item may be unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onMarkAllRead() {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const updated = await markAllNotificationsRead();
      setInfoMessage(
        updated > 0 ? `Marked ${updated} notification${updated === 1 ? '' : 's'} as read.` : 'No unread notifications.',
      );
      await Promise.all([load(), refreshBadge()]);
    } catch (error) {
      setErrorMessage(
        error instanceof NotificationServiceError
          ? error.message
          : 'Unable to mark notifications as read.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(notificationId: string) {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await deleteNotification(notificationId);
      await Promise.all([load(), refreshBadge()]);
    } catch (error) {
      setErrorMessage(
        error instanceof NotificationServiceError
          ? error.message
          : 'Unable to delete notification.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <View style={styles.header}>
        <AppText variant="display">Notifications</AppText>
        <AppText variant="body" color="textMuted">
          {unreadCount === 0
            ? 'You are caught up.'
            : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`}
        </AppText>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Mark all as read"
          variant="secondary"
          disabled={busy || unreadCount === 0}
          onPress={() => void onMarkAllRead()}
        />
        <AppButton
          label="Refresh"
          variant="ghost"
          disabled={busy || isLoading}
          onPress={() => {
            void load();
            void refreshBadge();
          }}
        />
      </View>

      <NotificationFiltersBar
        unreadOnly={unreadOnly}
        type={type}
        onUnreadOnlyChange={setUnreadOnly}
        onTypeChange={setType}
      />

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {infoMessage ? <InlineFormMessage message={infoMessage} tone="info" /> : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading notifications…
          </AppText>
        </View>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
          description="Agency briefings, groups, messages, and membership changes will appear here."
        />
      ) : null}

      {!isLoading && items.length > 0 ? (
        <View style={styles.list}>
          {items.map((notification) => (
            <View key={notification.id} style={styles.itemBlock}>
              <NotificationCard
                notification={notification}
                onPress={() => void onOpenNotification(notification)}
              />
              <AppButton
                label="Delete"
                variant="ghost"
                disabled={busy}
                onPress={() => void onDelete(notification.id)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing['4xl'],
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  itemBlock: {
    gap: spacing.xs,
  },
});
