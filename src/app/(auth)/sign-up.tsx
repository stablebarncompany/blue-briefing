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
import { APP_HOME_HREF } from '@/constants/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  validateEmailField,
  validatePasswordConfirmation,
  validatePasswordField,
  validateRequiredName,
} from '@/services/auth';
import { spacing } from '@/theme';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (submitting) {
      return;
    }

    const nextErrors = {
      firstName: validateRequiredName(firstName, 'First name'),
      lastName: validateRequiredName(lastName, 'Last name'),
      email: validateEmailField(email),
      password: validatePasswordField(password),
      confirmPassword: validatePasswordConfirmation(password, confirmPassword),
    };
    setFieldErrors(nextErrors);
    setFormError(null);
    setInfoMessage(null);

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp({
        firstName,
        lastName,
        email,
        password,
      });

      if (result.errorMessage) {
        setFormError(result.errorMessage);
        return;
      }

      if (result.requiresEmailConfirmation) {
        setInfoMessage(
          'Account created. Check your email to confirm your address before signing in.',
        );
        return;
      }

      router.replace(APP_HOME_HREF);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Create account"
      subtitle="An account does not yet grant agency access. Invitations and membership come next.">
      {formError ? <InlineFormMessage message={formError} /> : null}
      {infoMessage ? <InlineFormMessage message={infoMessage} tone="success" /> : null}

      <FormField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        textContentType="givenName"
        autoComplete="given-name"
        error={fieldErrors.firstName}
      />

      <FormField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        textContentType="familyName"
        autoComplete="family-name"
        error={fieldErrors.lastName}
      />

      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        error={fieldErrors.email}
      />

      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
      />

      <PasswordField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        error={fieldErrors.confirmPassword}
      />

      <AppButton
        label="Create account"
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting}
      />

      <View style={styles.footer}>
        <AppText variant="caption" color="textMuted">
          Already registered?
        </AppText>
        <Link href="/sign-in" asChild>
          <Pressable accessibilityRole="link">
            <AppText variant="caption" color="primary">
              Sign in
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
