import '@/global.css';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { BrandedLoadingScreen } from '@/components/common';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useHasPendingInviteToken } from '@/hooks/use-pending-invite-token';
import { AgencyProvider } from '@/services/agency';
import { AuthProvider } from '@/services/auth';
import { colors } from '@/theme';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <AuthProvider>
        <AgencyProvider>
          <StatusBar style="light" />
          <View style={styles.root}>
            <RootNavigator />
          </View>
        </AgencyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, isLoading: authLoading } = useAuth();
  const {
    isLoading: agencyLoading,
    activeMemberships,
    currentMembership,
  } = useAgency();
  const hasInviteToken = useHasPendingInviteToken();

  if (authLoading || (session && agencyLoading)) {
    return <BrandedLoadingScreen />;
  }

  const hasSession = !!session;
  const hasActiveMembership = activeMemberships.length > 0;
  const needsAgencySelection = activeMemberships.length > 1 && !currentMembership;
  const canEnterApp = hasActiveMembership && !!currentMembership;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: styles.stackContent }}>
      {/*
        Screen order matters for Expo Router Protected fallbacks.

        - Signed-out auth routes stay available even when an invite token is pending,
          so Sign In / Create Account are reachable from /accept-invite.
        - While signed in with a pending invite token, app destinations stay gated so
          auth completion falls back to /accept-invite (registered last).
      */}

      <Stack.Protected guard={hasSession && canEnterApp && !hasInviteToken}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={hasSession && needsAgencySelection && !hasInviteToken}>
        <Stack.Screen name="select-agency" />
      </Stack.Protected>

      <Stack.Protected guard={hasSession && !hasActiveMembership && !hasInviteToken}>
        <Stack.Screen name="pending-access" />
      </Stack.Protected>

      {/* Auth must remain reachable while signed out with a pending invite token. */}
      <Stack.Protected guard={!hasSession}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Screen name="accept-invite" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stackContent: {
    backgroundColor: colors.background,
  },
});
