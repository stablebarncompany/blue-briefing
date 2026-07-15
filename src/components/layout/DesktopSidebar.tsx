import { TabTrigger } from 'expo-router/ui';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/common/AppText';
import { NavTabButton } from '@/components/layout/NavTabButton';
import { NAV_ITEMS, PRODUCT_NAME } from '@/constants/navigation';
import { colors, layout, spacing } from '@/theme';

export function DesktopSidebar() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.sidebar,
        {
          paddingTop: Math.max(insets.top, spacing['2xl']),
          paddingBottom: Math.max(insets.bottom, spacing['2xl']),
        },
      ]}>
      <View style={styles.brandBlock}>
        <AppText variant="title">{PRODUCT_NAME}</AppText>
        <AppText variant="caption" color="textMuted">
          Agency communications
        </AppText>
      </View>

      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <NavTabButton item={item} />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.sidebarWidth,
    backgroundColor: colors.sidebar,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.lg,
    justifyContent: 'flex-start',
  },
  brandBlock: {
    gap: spacing.xs,
    marginBottom: spacing['3xl'],
    paddingHorizontal: spacing.sm,
  },
  navList: {
    gap: spacing.xs,
    flex: 1,
  },
});
