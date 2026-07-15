import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { AppCard } from '@/components/common/AppCard';
import { spacing } from '@/theme';

export type EmptyStateProps = {
  title: string;
  description?: string;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({ title, description, style }: EmptyStateProps) {
  return (
    <AppCard raised style={[styles.card, style]}>
      <View style={styles.content}>
        <AppText variant="heading">{title}</AppText>
        {description ? (
          <AppText variant="body" color="textMuted" style={styles.description}>
            {description}
          </AppText>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  content: {
    gap: spacing.md,
  },
  description: {
    maxWidth: 520,
  },
});
