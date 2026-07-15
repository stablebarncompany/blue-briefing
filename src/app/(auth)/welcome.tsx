import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, AuthScreenLayout } from '@/components/common';
import { spacing } from '@/theme';

export default function WelcomeScreen() {
  return (
    <AuthScreenLayout
      title="Blue Briefing"
      subtitle="Secure shift communications for every watch.">
      <View style={styles.actions}>
        <AppButton label="Sign in" onPress={() => router.push('/sign-in')} />
        <AppButton
          label="Create account"
          variant="secondary"
          onPress={() => router.push('/sign-up')}
        />
      </View>
      <AppText variant="caption" color="textSubtle">
        Agency access is granted separately after your account is created.
      </AppText>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
});
