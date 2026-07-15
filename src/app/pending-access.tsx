import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AuthScreenLayout,
  InlineFormMessage,
} from '@/components/common';
import { APP_HOME_HREF } from '@/constants/navigation';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';

export default function PendingAccessScreen() {
  const { signOut, user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setErrorMessage(null);
    try {
      const result = await signOut();
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
      }
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Agency access pending"
      subtitle="Your account is authenticated. Agency access and invitations will be configured next.">
      {user?.email ? (
        <AppText variant="caption" color="textMuted">
          Signed in as {user.email}
        </AppText>
      ) : null}

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <View style={styles.actions}>
        <AppButton label="Continue to app" onPress={() => router.replace(APP_HOME_HREF)} />
        <AppButton
          label="Sign out"
          variant="ghost"
          onPress={onSignOut}
          loading={signingOut}
          disabled={signingOut}
        />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
});
