import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AuthScreenLayout,
  FormField,
  InlineFormMessage,
  PasswordField,
} from '@/components/common';
import { ACCEPT_INVITE_HREF, APP_HOME_HREF } from '@/constants/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useHasPendingInviteToken } from '@/hooks/use-pending-invite-token';
import { validateEmailField, validatePasswordField } from '@/services/auth';
import { spacing } from '@/theme';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const hasInviteToken = useHasPendingInviteToken();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (submitting) {
      return;
    }

    const nextEmailError = validateEmailField(email);
    const nextPasswordError = validatePasswordField(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn({ email, password });
      if (result.errorMessage) {
        setFormError(result.errorMessage);
        return;
      }

      if (hasInviteToken) {
        router.replace(ACCEPT_INVITE_HREF);
        return;
      }

      router.replace(APP_HOME_HREF);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreenLayout title="Sign in" subtitle="Use your agency email to continue.">
      {hasInviteToken ? (
        <InlineFormMessage
          tone="info"
          message="You’re signing in to accept an agency invitation."
        />
      ) : null}
      {formError ? <InlineFormMessage message={formError} /> : null}

      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        error={emailError}
      />

      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
      />

      <Link href="/forgot-password" asChild>
        <Pressable accessibilityRole="link">
          <AppText variant="caption" color="primary">
            Forgot password?
          </AppText>
        </Pressable>
      </Link>

      <AppButton label="Sign in" onPress={onSubmit} loading={submitting} disabled={submitting} />

      <View style={styles.footer}>
        <AppText variant="caption" color="textMuted">
          Need an account?
        </AppText>
        <Link href="/sign-up" asChild>
          <Pressable accessibilityRole="link">
            <AppText variant="caption" color="primary">
              Create account
            </AppText>
          </Pressable>
        </Link>
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
