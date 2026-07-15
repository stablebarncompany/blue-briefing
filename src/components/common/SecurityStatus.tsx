import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radius, spacing, type ColorToken } from '@/theme';

export type SecurityStatusProps = {
  label?: string;
  tone?: 'success' | 'warning';
  style?: StyleProp<ViewStyle>;
};

export function SecurityStatus({
  label = 'Agency access pending',
  tone = 'warning',
  style,
}: SecurityStatusProps) {
  const color: ColorToken = tone === 'success' ? 'success' : 'warning';

  return (
    <View style={[styles.container, style]} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: colors[color] }]} />
      <AppText variant="caption" color={color}>
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
  },
});
