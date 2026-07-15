import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';

export default function MoreScreen() {
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
    <PageContainer>
      <SectionLabel>More</SectionLabel>
      <EmptyState title="Account & resources." />

      <View style={styles.panel}>
        {user?.email ? (
          <AppText variant="caption" color="textMuted">
            Signed in as {user.email}
          </AppText>
        ) : null}
        <AppText variant="body" color="textMuted">
          Membership status: Agency access pending.
        </AppText>

        <Link href="/pending-access" asChild>
          <Pressable accessibilityRole="link">
            <AppText variant="caption" color="primary">
              View pending access details
            </AppText>
          </Pressable>
        </Link>

        {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

        <AppButton
          label="Sign out"
          variant="ghost"
          onPress={onSignOut}
          loading={signingOut}
          disabled={signingOut}
        />
      </View>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
});
