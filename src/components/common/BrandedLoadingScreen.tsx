import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { PRODUCT_NAME } from '@/constants/navigation';
import { colors, spacing } from '@/theme';

export function BrandedLoadingScreen() {
  return (
    <View style={styles.container} accessibilityLabel="Loading Blue Briefing">
      <AppText variant="heading">{PRODUCT_NAME}</AppText>
      <AppText variant="body" color="textMuted">
        Preparing your secure session…
      </AppText>
      <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing['2xl'],
  },
  spinner: {
    marginTop: spacing.lg,
  },
});
