import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AuthScreenLayout,
  InlineFormMessage,
} from '@/components/common';
import { ACCEPT_INVITE_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';

export default function PendingAccessScreen() {
  const { signOut, user } = useAuth();
  const { memberships, error, refreshAgencyContext } = useAgency();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pendingCount = memberships.filter((item) => item.status === 'pending').length;

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

  async function onRefresh() {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    setErrorMessage(null);
    try {
      await refreshAgencyContext();
    } finally {
      setRefreshing(false);
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

      {pendingCount > 0 ? (
        <AppText variant="body" color="textMuted">
          You have {pendingCount} pending membership request{pendingCount === 1 ? '' : 's'}. An
          administrator must activate access before you can enter the agency workspace.
        </AppText>
      ) : (
        <AppText variant="body" color="textMuted">
          No active agency membership was found for this account.
        </AppText>
      )}

      {error ? <InlineFormMessage message={error} /> : null}
      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <View style={styles.actions}>
        <AppButton
          label="Accept invitation"
          onPress={() => router.push(ACCEPT_INVITE_HREF)}
          disabled={refreshing || signingOut}
        />
        <AppButton
          label="Refresh membership"
          variant="secondary"
          onPress={onRefresh}
          loading={refreshing}
          disabled={refreshing || signingOut}
        />
        <AppButton
          label="Sign out"
          variant="ghost"
          onPress={onSignOut}
          loading={signingOut}
          disabled={signingOut || refreshing}
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
