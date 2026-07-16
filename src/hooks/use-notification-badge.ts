import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useAgency } from '@/hooks/use-agency';
import {
  NotificationServiceError,
  getUnreadNotificationCount,
  subscribeToNotifications,
} from '@/services/notifications';

const POLL_INTERVAL_MS = 30_000;

/**
 * Live unread in-app notification count for the signed-in recipient.
 * Scoped optionally to the current agency. Never fabricates counts.
 * Realtime is shared per recipient (see subscribeToNotifications).
 */
export function useNotificationBadge() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentAgency, isLoading: agencyLoading } = useAgency();
  const userId = user?.id ?? null;
  const agencyId = currentAgency?.id ?? null;

  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const agencyIdRef = useRef(agencyId);
  useEffect(() => {
    agencyIdRef.current = agencyId;
  }, [agencyId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const count = await getUnreadNotificationCount(agencyIdRef.current);
      setUnreadCount(count);
    } catch (error) {
      setUnreadCount(0);
      setErrorMessage(
        error instanceof NotificationServiceError
          ? error.message
          : 'Unable to load unread notifications.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial + agency-scoped count refresh (does not recreate Realtime).
  useEffect(() => {
    if (authLoading || agencyLoading) {
      return;
    }

    if (!userId) {
      queueMicrotask(() => {
        setUnreadCount(0);
        setIsLoading(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      void refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [agencyId, agencyLoading, authLoading, refresh, userId]);

  // Shared Realtime subscription — deps are only auth readiness + recipient id.
  useEffect(() => {
    if (authLoading || !userId) {
      return;
    }

    let realtimeFailed = false;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribeToNotifications(userId, {
        onChange: () => {
          void refresh();
        },
        onError: () => {
          realtimeFailed = true;
        },
      });
    } catch {
      realtimeFailed = true;
      if (__DEV__) {
        console.warn('[notifications] Realtime subscribe failed; using refresh fallback.');
      }
    }

    const timer = setInterval(() => {
      if (realtimeFailed) {
        void refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [authLoading, refresh, userId]);

  return {
    unreadCount,
    isLoading,
    errorMessage,
    refresh,
  };
}
