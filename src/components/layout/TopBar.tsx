import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton } from '@/components/common';
import { SecurityStatus } from '@/components/common/SecurityStatus';
import { NOTIFICATIONS_HREF, PRODUCT_NAME } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { useNotificationBadge } from '@/hooks/use-notification-badge';
import { colors, layout, radius, spacing } from '@/theme';

export type TopBarProps = {
  title?: string;
};

export function TopBar({ title }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const isWide = useIsWideLayout();
  const { currentAgency, currentMembership, isLoading } = useAgency();
  const { unreadCount } = useNotificationBadge();

  const hasActiveContext = !!currentAgency && !!currentMembership && !isLoading;
  const statusLabel = hasActiveContext
    ? currentAgency.name
    : isLoading
      ? 'Loading agency…'
      : 'Agency access pending';
  const statusTone = hasActiveContext ? 'success' : 'warning';
  const securityLabel = hasActiveContext ? 'Agency Secure' : statusLabel;
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: isWide ? spacing.lg : Math.max(insets.top, spacing.lg),
        },
      ]}>
      <View style={styles.left}>
        <AppText variant="title">{title ?? PRODUCT_NAME}</AppText>
        {!isWide ? (
          <AppText variant="caption" color="textMuted">
            {hasActiveContext ? statusLabel : 'Stay ready for the next watch'}
          </AppText>
        ) : hasActiveContext ? (
          <AppText variant="caption" color="textMuted">
            {statusLabel}
          </AppText>
        ) : null}
      </View>

      <View style={styles.right}>
        <View style={styles.bellWrap}>
          <IconButton
            label="Alerts"
            color={unreadCount > 0 ? 'primary' : 'textMuted'}
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications, no unread'
            }
            onPress={() => router.push(NOTIFICATIONS_HREF)}
          />
          {unreadCount > 0 ? (
            <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
              <AppText variant="caption" color="text">
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </AppText>
            </View>
          ) : null}
        </View>
        <SecurityStatus label={securityLabel} tone={statusTone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: layout.topBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  left: {
    flex: 1,
    gap: spacing.xxs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bellWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.background,
  },
});
