import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radius, spacing } from '@/theme';

export type SecurityStatusProps = {
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function SecurityStatus({ label = 'Agency Secure', style }: SecurityStatusProps) {
  return (
    <View style={[styles.container, style]} accessibilityRole="text">
      <View style={styles.dot} />
      <AppText variant="caption" color="success">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
});
