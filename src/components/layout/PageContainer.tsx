import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, spacing } from '@/theme';

export type PageContainerProps = {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function PageContainer({
  children,
  scroll = true,
  style,
  contentStyle,
}: PageContainerProps) {
  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, style]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.inner, contentStyle]}>{children}</View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flex, styles.contentFixed, style]}>
      <View style={[styles.inner, styles.innerFixed, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
  },
  contentFixed: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
    paddingBottom: 0,
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  innerFixed: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
});
