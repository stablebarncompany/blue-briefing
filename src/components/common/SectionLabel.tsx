import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { spacing } from '@/theme';

export type SectionLabelProps = {
  children: string;
  style?: StyleProp<ViewStyle>;
};

export function SectionLabel({ children, style }: SectionLabelProps) {
  return (
    <View style={[styles.container, style]}>
      <AppText variant="overline" color="textSubtle">
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
});
