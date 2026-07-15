import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/common/AppText';
import { SecurityStatus } from '@/components/common/SecurityStatus';
import { PRODUCT_NAME } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { colors, layout, spacing } from '@/theme';

export type TopBarProps = {
  title?: string;
};

export function TopBar({ title }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const isWide = useIsWideLayout();
  const { currentAgency, currentMembership, isLoading } = useAgency();

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
      <SecurityStatus label={securityLabel} tone={statusTone} />
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
});
