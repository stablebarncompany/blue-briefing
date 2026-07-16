import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AuthScreenLayout,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import {
  APP_HOME_HREF,
  PENDING_ACCESS_HREF,
  SELECT_AGENCY_HREF,
  SIGN_IN_HREF,
  SIGN_UP_HREF,
  WELCOME_HREF,
} from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { writeStoredAgencyId } from '@/services/agency/storage';
import {
  PersonnelServiceError,
  acceptAgencyInvite,
  clearPendingInviteToken,
  getPendingInviteToken,
  normalizeInviteToken,
  setPendingInviteToken,
} from '@/services/personnel';
import { spacing } from '@/theme';

type AcceptState =
  | 'idle'
  | 'accepting'
  | 'accepted'
  | 'already_accepted'
  | 'expired'
  | 'revoked'
  | 'email_mismatch'
  | 'invalid'
  | 'error';

function classifyAcceptError(message: string): AcceptState {
  const lower = message.toLowerCase();
  if (lower.includes('expired')) {
    return 'expired';
  }
  if (lower.includes('revoked')) {
    return 'revoked';
  }
  if (lower.includes('does not match')) {
    return 'email_mismatch';
  }
  if (lower.includes('invalid') || lower.includes('not found')) {
    return 'invalid';
  }
  if (lower.includes('no longer pending') || lower.includes('already')) {
    return 'already_accepted';
  }
  return 'error';
}

function shouldClearTokenForState(state: AcceptState): boolean {
  return (
    state === 'expired' ||
    state === 'revoked' ||
    state === 'invalid' ||
    state === 'already_accepted' ||
    state === 'accepted'
  );
}

const STATE_COPY: Record<AcceptState, string> = {
  idle: 'Enter or open a valid invitation to join your agency.',
  accepting: 'Accepting invitation…',
  accepted: 'Invitation accepted. You now have agency access.',
  already_accepted: 'This invitation was already accepted for your account.',
  expired: 'This invitation has expired. Ask an administrator for a new one.',
  revoked: 'This invitation has been revoked.',
  email_mismatch:
    'Your signed-in email does not match this invitation. Sign in with the invited email address.',
  invalid: 'This invitation is invalid or could not be found.',
  error: 'Unable to accept this invitation right now.',
};

function preserveInviteTokenFromInput(tokenInput: string): string | null {
  const token = normalizeInviteToken(tokenInput) ?? getPendingInviteToken();
  if (token) {
    setPendingInviteToken(token);
  }
  return token;
}

export default function AcceptInviteScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const paramToken = normalizeInviteToken(
    typeof params.token === 'string' ? params.token : undefined,
  );
  const { session, user, signOut } = useAuth();
  const { activeMemberships, currentMembership, refreshAgencyContext } = useAgency();
  const attemptedForUserId = useRef<string | null>(null);

  const [tokenInput, setTokenInput] = useState(() => paramToken ?? getPendingInviteToken() ?? '');
  const [state, setState] = useState<AcceptState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [navError, setNavError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!paramToken) {
        return;
      }
      setPendingInviteToken(paramToken);
      queueMicrotask(() => {
        setTokenInput((current) => (normalizeInviteToken(current) ? current : paramToken));
      });
    }, [paramToken]),
  );

  const leaveInviteFlow = useCallback(
    (clearToken: boolean) => {
      if (clearToken) {
        clearPendingInviteToken();
      }
      if (!session) {
        router.replace(WELCOME_HREF);
        return;
      }
      if (activeMemberships.length > 1 && !currentMembership) {
        router.replace(SELECT_AGENCY_HREF);
        return;
      }
      if (activeMemberships.length > 0) {
        router.replace(APP_HOME_HREF);
        return;
      }
      router.replace(PENDING_ACCESS_HREF);
    },
    [activeMemberships.length, currentMembership, session],
  );

  const onCancel = useCallback(() => {
    const abandon = () => leaveInviteFlow(true);

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Leave this invitation without accepting?')) {
        abandon();
      }
      return;
    }

    Alert.alert('Cancel invitation?', 'Leave this invitation without accepting?', [
      { text: 'Keep invitation', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: abandon },
    ]);
  }, [leaveInviteFlow]);

  const goToAuth = useCallback(
    (href: typeof SIGN_IN_HREF | typeof SIGN_UP_HREF) => {
      setNavError(null);
      const token = preserveInviteTokenFromInput(tokenInput);
      if (!token) {
        setNavError('Enter or paste a valid invitation code before continuing.');
        return;
      }
      try {
        router.push(href);
      } catch {
        setNavError('Unable to open the authentication screen. Please try again.');
      }
    },
    [tokenInput],
  );

  const onAccept = useCallback(
    async (rawToken?: string) => {
      const token = normalizeInviteToken(rawToken ?? tokenInput);
      if (!token) {
        setErrorMessage('Paste an invitation code or open a valid invitation link.');
        return;
      }

      if (!session) {
        setPendingInviteToken(token);
        setNavError(null);
        try {
          router.push(SIGN_IN_HREF);
        } catch {
          setNavError('Unable to open Sign In. Please try again.');
        }
        return;
      }

      setState('accepting');
      setErrorMessage(null);
      setNavError(null);
      setPendingInviteToken(token);

      try {
        const result = await acceptAgencyInvite(token);
        clearPendingInviteToken();
        if (result.agency_id) {
          await writeStoredAgencyId(result.agency_id);
        }
        await refreshAgencyContext();
        setState(result.status === 'already_accepted' ? 'already_accepted' : 'accepted');
      } catch (error) {
        const message =
          error instanceof PersonnelServiceError
            ? error.message
            : 'Unable to accept invitation.';
        const nextState = classifyAcceptError(message);
        setState(nextState);
        setErrorMessage(message);
        if (shouldClearTokenForState(nextState)) {
          clearPendingInviteToken();
        }
        // Keep token on email mismatch so the user can switch accounts and retry.
      }
    },
    [refreshAgencyContext, session, tokenInput],
  );

  // Auto-accept once per authenticated user when a real token is present.
  useFocusEffect(
    useCallback(() => {
      const userId = user?.id ?? null;
      if (!session || !userId || state === 'accepting') {
        return;
      }
      if (state === 'accepted' || state === 'already_accepted') {
        return;
      }
      if (attemptedForUserId.current === userId) {
        return;
      }

      const token =
        normalizeInviteToken(paramToken) ??
        normalizeInviteToken(tokenInput) ??
        getPendingInviteToken();
      if (!token) {
        return;
      }

      attemptedForUserId.current = userId;
      queueMicrotask(() => {
        void onAccept(token);
      });
    }, [onAccept, paramToken, session, state, tokenInput, user?.id]),
  );

  async function onSignOutForInvitedEmail() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setNavError(null);
    setErrorMessage(null);
    preserveInviteTokenFromInput(tokenInput);
    attemptedForUserId.current = null;

    try {
      const result = await signOut();
      if (result.errorMessage) {
        setNavError(result.errorMessage);
        return;
      }
      try {
        router.replace(SIGN_IN_HREF);
      } catch {
        setNavError('Signed out, but unable to open Sign In. Use Continue to sign in.');
      }
    } finally {
      setSigningOut(false);
    }
  }

  async function onCreateAccountForInvite() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setNavError(null);
    preserveInviteTokenFromInput(tokenInput);
    attemptedForUserId.current = null;

    try {
      if (session) {
        const result = await signOut();
        if (result.errorMessage) {
          setNavError(result.errorMessage);
          return;
        }
      }
      try {
        router.replace(SIGN_UP_HREF);
      } catch {
        setNavError('Unable to open Create Account. Please try again.');
      }
    } finally {
      setSigningOut(false);
    }
  }

  const showSuccess = state === 'accepted' || state === 'already_accepted';
  const showEmailMismatch = state === 'email_mismatch';

  return (
    <AuthScreenLayout
      title="Accept invitation"
      subtitle="Join your agency with a secure invitation link or code.">
      {user?.email ? (
        <AppText variant="caption" color="textMuted">
          Signed in as {user.email}
        </AppText>
      ) : (
        <AppText variant="caption" color="textMuted">
          Sign in or create an account with the invited email address to continue.
        </AppText>
      )}

      <AppText variant="body" color="textMuted">
        {STATE_COPY[state]}
      </AppText>

      {errorMessage && !showSuccess ? <InlineFormMessage message={errorMessage} /> : null}
      {navError ? <InlineFormMessage message={navError} /> : null}
      {showSuccess ? (
        <InlineFormMessage message={STATE_COPY[state]} tone="success" />
      ) : null}

      {!showSuccess ? (
        <>
          <FormField
            label="Invitation code"
            value={tokenInput}
            onChangeText={(value) => {
              setTokenInput(value);
              if (state !== 'idle' && state !== 'accepting') {
                setState('idle');
                setErrorMessage(null);
              }
            }}
            placeholder="Paste invitation code"
            autoCapitalize="none"
            editable={state !== 'accepting' && !signingOut}
          />

          <View style={styles.actions}>
            {session ? (
              <AppButton
                label="Accept invitation"
                onPress={() => void onAccept()}
                loading={state === 'accepting'}
                disabled={state === 'accepting' || signingOut}
              />
            ) : (
              <AppButton
                label="Continue to sign in"
                onPress={() => goToAuth(SIGN_IN_HREF)}
                disabled={signingOut}
              />
            )}

            {!session ? (
              <>
                <AppButton
                  label="Create account"
                  variant="secondary"
                  onPress={() => goToAuth(SIGN_UP_HREF)}
                />
                <AppButton
                  label="Sign in"
                  variant="ghost"
                  onPress={() => goToAuth(SIGN_IN_HREF)}
                />
              </>
            ) : null}

            {showEmailMismatch && session ? (
              <>
                <AppButton
                  label="Sign out and use invited email"
                  variant="secondary"
                  onPress={() => void onSignOutForInvitedEmail()}
                  loading={signingOut}
                  disabled={signingOut}
                />
                <AppButton
                  label="Create account with invited email"
                  variant="ghost"
                  onPress={() => void onCreateAccountForInvite()}
                  disabled={signingOut}
                />
              </>
            ) : null}

            <AppButton
              label="Cancel"
              variant="ghost"
              onPress={onCancel}
              disabled={state === 'accepting' || signingOut}
            />
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <AppButton
            label="Continue to agency"
            onPress={() => {
              clearPendingInviteToken();
              router.replace(APP_HOME_HREF);
            }}
          />
          <AppButton
            label="Close"
            variant="ghost"
            onPress={() => leaveInviteFlow(true)}
          />
        </View>
      )}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
});
