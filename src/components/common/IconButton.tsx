import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radius, spacing, type ColorToken } from '@/theme';

export type IconButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  color?: ColorToken;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
};

/** Compact press target. Uses text label for cross-platform web/native safety. */
export function IconButton({
  label,
  color = 'textMuted',
  style,
  accessibilityLabel,
  ...rest
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      {...rest}>
      <AppText variant="label" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
    backgroundColor: colors.surfaceRaised,
  },
});
