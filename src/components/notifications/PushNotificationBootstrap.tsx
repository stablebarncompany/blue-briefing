import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { type Href, router } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useAgency } from '@/hooks/use-agency';
import {
  addNotificationResponseListener,
  cleanupPushNotificationListeners,
  configureNotificationHandler,
  refreshPushRegistration,
  setPendingPushRoute,
  takePendingPushRoute,
} from '@/services/push-notifications';
import { isSafePushRoute } from '@/types/pushNotifications';

/**
 * Configures notification handling and deep links for authenticated native sessions.
 * Does not prompt for permission — registration is user-initiated from Account settings.
 */
export function PushNotificationBootstrap() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentAgency, isLoading: agencyLoading } = useAgency();
  const userId = user?.id ?? null;
  const agencyId = currentAgency?.id ?? null;
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    void configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || authLoading || !userId) {
      return;
    }

    let remove: (() => void) | undefined;
    let cancelled = false;

    void addNotificationResponseListener((payload) => {
      if (cancelled) {
        return;
      }
      if (!isSafePushRoute(payload.route)) {
        setPendingPushRoute(null);
        return;
      }
      setPendingPushRoute(payload.route);
      try {
        router.push(payload.route as Href);
        setPendingPushRoute(null);
      } catch {
        // Keep pending route for post-auth navigation.
      }
    }).then((unsubscribe) => {
      if (cancelled) {
        unsubscribe();
        return;
      }
      remove = unsubscribe;
    });

    return () => {
      cancelled = true;
      remove?.();
      cleanupPushNotificationListeners();
    };
  }, [authLoading, userId]);

  // Soft-refresh registration when agency context is ready and permission already granted.
  useEffect(() => {
    if (Platform.OS === 'web' || authLoading || agencyLoading || !userId || !agencyId) {
      return;
    }
    void refreshPushRegistration({ agencyId }).catch(() => {
      // Silent: permission may be undetermined; user enables from Account.
    });
  }, [agencyId, agencyLoading, authLoading, userId]);

  // After sign-in, consume any pending safe push route once.
  useEffect(() => {
    if (authLoading || agencyLoading || !userId || !agencyId || navigatedRef.current) {
      return;
    }
    const pending = takePendingPushRoute();
    if (!pending || !isSafePushRoute(pending)) {
      return;
    }
    navigatedRef.current = true;
    queueMicrotask(() => {
      router.push(pending as Href);
    });
  }, [agencyId, agencyLoading, authLoading, userId]);

  return null;
}
