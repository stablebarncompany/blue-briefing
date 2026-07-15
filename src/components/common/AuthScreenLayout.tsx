import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/common/AppText';
import { PRODUCT_NAME } from '@/constants/navigation';
import { colors, layout, spacing } from '@/theme';

export type AuthScreenLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AuthScreenLayout({ title, subtitle, children }: AuthScreenLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, spacing['3xl']),
            paddingBottom: Math.max(insets.bottom, spacing['3xl']),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <View style={styles.brand}>
            <AppText variant="caption" color="textSubtle">
              {PRODUCT_NAME}
            </AppText>
            <AppText variant="heading">{title}</AppText>
            {subtitle ? (
              <AppText variant="body" color="textMuted">
                {subtitle}
              </AppText>
            ) : null}
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing['3xl'],
  },
  brand: {
    gap: spacing.sm,
  },
  body: {
    gap: spacing.lg,
  },
});
