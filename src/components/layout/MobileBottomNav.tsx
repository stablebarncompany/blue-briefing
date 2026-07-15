import { TabTrigger } from 'expo-router/ui';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavTabButton } from '@/components/layout/NavTabButton';
import { NAV_ITEMS } from '@/constants/navigation';
import { colors, layout, spacing } from '@/theme';

export function MobileBottomNav() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}>
      <View style={styles.row}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <NavTabButton item={item} compact />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.sidebar,
    paddingTop: spacing.sm,
    minHeight: layout.bottomNavHeight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
});
