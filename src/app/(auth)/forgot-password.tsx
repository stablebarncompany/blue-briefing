import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AuthScreenLayout,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { useAuth } from '@/hooks/use-auth';
import { validateEmailField } from '@/services/auth';
import { spacing } from '@/theme';

const GENERIC_SUCCESS =
  'If an account exists for that email, password reset instructions have been sent.';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (submitting) {
      return;
    }

    const nextEmailError = validateEmailField(email);
    setEmailError(nextEmailError);
    setFormError(null);
    setSuccessMessage(null);

    if (nextEmailError) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.errorMessage) {
        setFormError(result.errorMessage);
        return;
      }
      setSuccessMessage(GENERIC_SUCCESS);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Forgot password"
      subtitle="Enter your email and we will send reset instructions when an account matches.">
      {formError ? <InlineFormMessage message={formError} /> : null}
      {successMessage ? <InlineFormMessage message={successMessage} tone="success" /> : null}

      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        error={emailError}
      />

      <AppButton
        label="Send reset link"
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting}
      />

      <View style={styles.footer}>
        <Link href="/sign-in" asChild>
          <Pressable accessibilityRole="link">
            <AppText variant="caption" color="primary">
              Back to sign in
            </AppText>
          </Pressable>
        </Link>
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.sm,
  },
});
