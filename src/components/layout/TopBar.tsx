import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/common/AppText';
import { SecurityStatus } from '@/components/common/SecurityStatus';
import { PRODUCT_NAME } from '@/constants/navigation';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { colors, layout, spacing } from '@/theme';

export type TopBarProps = {
  title?: string;
};

export function TopBar({ title }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const isWide = useIsWideLayout();

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
            Stay ready for the next watch
          </AppText>
        ) : null}
      </View>
      <SecurityStatus label="Agency access pending" tone="warning" />
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
