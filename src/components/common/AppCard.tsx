import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';

export type AppCardProps = ViewProps & {
  raised?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ raised = false, padded = true, style, children, ...rest }: AppCardProps) {
  return (
    <View
      style={[
        styles.card,
        raised && styles.raised,
        padded && styles.padded,
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    ...shadows.card,
  },
  padded: {
    padding: spacing['2xl'],
  },
});
