import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { subscribeToNotifications } from '@/services/notifications';

/**
 * Owns the app-shell Realtime notification subscription once auth is ready.
 * Additional screens/hooks may attach listeners via subscribeToNotifications;
 * the service keeps a single channel per recipient.
 */
export function NotificationRealtimeHost() {
  const { user, isLoading } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (isLoading || !userId) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToNotifications(userId, {
        onChange: () => {
          // Listener slots are owned by badge/inbox hooks; host keeps the channel alive.
        },
        onError: () => {
          if (__DEV__) {
            console.warn('[notifications] Realtime unavailable; screens will refresh manually.');
          }
        },
      });
    } catch {
      if (__DEV__) {
        console.warn('[notifications] Realtime subscribe failed in app shell.');
      }
    }

    return () => {
      unsubscribe?.();
    };
  }, [isLoading, userId]);

  return null;
}
