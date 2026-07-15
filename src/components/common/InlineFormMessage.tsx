import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radius, spacing, type ColorToken } from '@/theme';

export type InlineFormMessageProps = {
  message: string;
  tone?: 'error' | 'success' | 'info';
};

const toneColor: Record<NonNullable<InlineFormMessageProps['tone']>, ColorToken> = {
  error: 'danger',
  success: 'success',
  info: 'textMuted',
};

export function InlineFormMessage({ message, tone = 'error' }: InlineFormMessageProps) {
  return (
    <View
      style={[styles.box, tone === 'success' && styles.success, tone === 'info' && styles.info]}
      accessibilityLiveRegion="polite">
      <AppText variant="caption" color={toneColor[tone]}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  success: {
    borderColor: colors.success,
  },
  info: {
    borderColor: colors.border,
  },
});
