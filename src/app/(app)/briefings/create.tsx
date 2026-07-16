import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import {
  BriefingFormFields,
  EMPTY_BRIEFING_FORM,
  briefingFormToInput,
  type BriefingFormValues,
} from '@/components/briefings';
import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { briefingDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import {
  BriefingServiceError,
  createBriefing,
  validateCreateBriefingInput,
} from '@/services/briefings';
import { spacing } from '@/theme';

export default function CreateBriefingScreen() {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const [values, setValues] = useState<BriefingFormValues>(EMPTY_BRIEFING_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof BriefingFormValues, string>>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (submitting || !currentAgency?.id || !user?.id) {
      return;
    }

    const input = briefingFormToInput(values);
    const validationError = validateCreateBriefingInput(input);
    if (validationError) {
      const nextErrors: Partial<Record<keyof BriefingFormValues, string>> = {};
      if (!values.title.trim()) {
        nextErrors.title = 'Title is required.';
      }
      if (!values.body.trim()) {
        nextErrors.body = 'Body is required.';
      }
      if (!nextErrors.title && !nextErrors.body) {
        setErrorMessage(validationError);
      } else {
        setErrorMessage(null);
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setErrorMessage(null);

    try {
      const created = await createBriefing({
        agencyId: currentAgency.id,
        authorId: user.id,
        input,
      });
      router.replace(briefingDetailHref(created.id));
    } catch (error) {
      const message =
        error instanceof BriefingServiceError
          ? error.message
          : 'Unable to create briefing.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!currentAgency || !user) {
    return (
      <PageContainer>
        <EmptyState
          title="Agency required"
          description="An active agency membership is required to create briefings."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <View style={styles.header}>
        <AppText variant="display">New briefing</AppText>
        <AppText variant="body" color="textMuted">
          Create a searchable pass-on for your agency watch.
        </AppText>
      </View>

      <BriefingFormFields
        values={values}
        onChange={setValues}
        fieldErrors={fieldErrors}
        disabled={submitting}
      />

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <View style={styles.actions}>
        <AppButton
          label="Create briefing"
          onPress={() => void onSubmit()}
          loading={submitting}
          disabled={submitting}
        />
        <AppButton
          label="Cancel"
          variant="ghost"
          disabled={submitting}
          onPress={() => router.back()}
        />
      </View>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing['3xl'],
  },
});
