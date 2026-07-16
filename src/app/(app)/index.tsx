import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { BriefingCard } from '@/components/briefings';
import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import {
  BRIEFINGS_CREATE_HREF,
  BRIEFINGS_HREF,
  NOTIFICATIONS_HREF,
  briefingDetailHref,
} from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useNotificationBadge } from '@/hooks/use-notification-badge';
import {
  BriefingServiceError,
  getHomeBriefingSummary,
} from '@/services/briefings';
import { colors, spacing } from '@/theme';
import type { BriefingWithMeta } from '@/types/briefings';

type HomeSummary = {
  criticalActiveCount: number;
  unacknowledgedCount: number;
  highlightBriefings: BriefingWithMeta[];
};

export default function HomeScreen() {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const { unreadCount: unreadNotificationCount, refresh: refreshNotificationBadge } =
    useNotificationBadge();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;

  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agencyId || !userId) {
      setSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const next = await getHomeBriefingSummary({
        agencyId,
        currentUserId: userId,
      });
      setSummary(next);
      await refreshNotificationBadge();
    } catch (error) {
      const message =
        error instanceof BriefingServiceError
          ? error.message
          : 'Unable to load home briefing activity.';
      setErrorMessage(message);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, refreshNotificationBadge, userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return (
    <PageContainer>
      <View style={styles.header}>
        <AppText variant="display">Home</AppText>
        <AppText variant="body" color="textMuted">
          Good watch. Stay informed.
        </AppText>
      </View>

      {!currentAgency ? (
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership to see briefing activity."
        />
      ) : null}

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading briefing activity…
          </AppText>
        </View>
      ) : null}

      {!isLoading && currentAgency && summary ? (
        <>
          <View style={styles.statsRow}>
            <AppCard raised style={styles.statCard}>
              <AppText variant="caption" color="textSubtle">
                Critical active
              </AppText>
              <AppText variant="display" color="danger">
                {summary.criticalActiveCount}
              </AppText>
            </AppCard>
            <AppCard raised style={styles.statCard}>
              <AppText variant="caption" color="textSubtle">
                Unacknowledged for you
              </AppText>
              <AppText variant="display" color="warning">
                {summary.unacknowledgedCount}
              </AppText>
            </AppCard>
            <AppCard raised style={styles.statCard}>
              <AppText variant="caption" color="textSubtle">
                Unread notifications
              </AppText>
              <AppText variant="display" color="primary">
                {unreadNotificationCount}
              </AppText>
              <AppButton
                label="Open inbox"
                variant="ghost"
                onPress={() => router.push(NOTIFICATIONS_HREF)}
              />
            </AppCard>
          </View>
          <AppText variant="caption" color="textSubtle">
            Direct message unread counts are not shown yet — message read receipts are not
            tracked. Reading a notification is not the same as reading a conversation.
          </AppText>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="title">Recent briefings</AppText>
              <AppButton
                label="View all"
                variant="ghost"
                onPress={() => router.push(BRIEFINGS_HREF)}
              />
            </View>

            {summary.highlightBriefings.length === 0 ? (
              <EmptyState
                title="No active briefings"
                description="Pinned and newest active briefings will appear here."
              />
            ) : (
              <View style={styles.list}>
                {summary.highlightBriefings.map((briefing) => (
                  <BriefingCard
                    key={briefing.id}
                    briefing={briefing}
                    onPress={() => router.push(briefingDetailHref(briefing.id))}
                  />
                ))}
              </View>
            )}
          </View>

          <AppButton
            label="Create briefing"
            onPress={() => router.push(BRIEFINGS_CREATE_HREF)}
            style={styles.createButton}
          />
        </>
      ) : null}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing['4xl'],
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 160,
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  createButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing['3xl'],
  },
});
