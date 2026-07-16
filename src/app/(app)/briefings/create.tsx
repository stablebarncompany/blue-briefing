import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import {
  BriefingFormFields,
  EMPTY_BRIEFING_FORM,
  PendingAttachmentsPanel,
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
  BriefingAttachmentServiceError,
  pickBriefingDocuments,
  pickBriefingImages,
  uploadBriefingAttachment,
} from '@/services/briefing-attachments';
import {
  BriefingServiceError,
  createBriefing,
  validateCreateBriefingInput,
} from '@/services/briefings';
import { spacing } from '@/theme';
import {
  ATTACHMENT_MAX_PER_BRIEFING,
  type PendingAttachment,
} from '@/types/briefing-attachments';

export default function CreateBriefingScreen() {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const [values, setValues] = useState<BriefingFormValues>(EMPTY_BRIEFING_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof BriefingFormValues, string>>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [createdBriefingId, setCreatedBriefingId] = useState<string | null>(null);

  async function onAddPhotos() {
    if (submitting || !currentAgency) {
      return;
    }
    setErrorMessage(null);
    try {
      const remaining = ATTACHMENT_MAX_PER_BRIEFING - pendingAttachments.length;
      const picked = await pickBriefingImages({ remainingSlots: remaining });
      if (picked.length > 0) {
        setPendingAttachments((current) => [...current, ...picked].slice(0, ATTACHMENT_MAX_PER_BRIEFING));
      }
    } catch (error) {
      const message =
        error instanceof BriefingAttachmentServiceError
          ? error.message
          : 'Unable to add photos.';
      setErrorMessage(message);
    }
  }

  async function onAddDocuments() {
    if (submitting || !currentAgency) {
      return;
    }
    setErrorMessage(null);
    try {
      const remaining = ATTACHMENT_MAX_PER_BRIEFING - pendingAttachments.length;
      const picked = await pickBriefingDocuments({ remainingSlots: remaining });
      if (picked.length > 0) {
        setPendingAttachments((current) => [...current, ...picked].slice(0, ATTACHMENT_MAX_PER_BRIEFING));
      }
    } catch (error) {
      const message =
        error instanceof BriefingAttachmentServiceError
          ? error.message
          : 'Unable to add documents.';
      setErrorMessage(message);
    }
  }

  async function onSubmit() {
    if (submitting || !currentAgency?.id || !user?.id) {
      return;
    }

    const input = briefingFormToInput(values);
    const validationError = validateCreateBriefingInput(input);
    if (!createdBriefingId && validationError) {
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
    setInfoMessage(null);
    setUploadProgressLabel(null);

    try {
      let briefingId = createdBriefingId;
      if (!briefingId) {
        const created = await createBriefing({
          agencyId: currentAgency.id,
          authorId: user.id,
          input,
        });
        briefingId = created.id;
        setCreatedBriefingId(created.id);
      }

      const failed: PendingAttachment[] = [];
      const total = pendingAttachments.length;
      for (let index = 0; index < pendingAttachments.length; index += 1) {
        const pending = pendingAttachments[index];
        if (!pending) {
          continue;
        }
        setUploadProgressLabel(`Uploading attachment ${index + 1} of ${total}…`);
        try {
          await uploadBriefingAttachment({
            agencyId: currentAgency.id,
            briefingId,
            uploadedBy: user.id,
            pending,
          });
        } catch {
          failed.push(pending);
        }
      }

      if (failed.length > 0) {
        setPendingAttachments(failed);
        setUploadProgressLabel(null);
        setErrorMessage(
          `Briefing saved, but ${failed.length} attachment${failed.length === 1 ? '' : 's'} failed to upload. Retry to upload the remaining files without creating another briefing.`,
        );
        setInfoMessage('You can retry attachment upload now.');
        return;
      }

      router.replace(briefingDetailHref(briefingId));
    } catch (error) {
      const message =
        error instanceof BriefingServiceError || error instanceof BriefingAttachmentServiceError
          ? error.message
          : 'Unable to create briefing.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
      setUploadProgressLabel(null);
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

  const submitLabel = createdBriefingId
    ? pendingAttachments.length > 0
      ? 'Retry attachment upload'
      : 'Open briefing'
    : 'Create briefing';

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
        disabled={submitting || !!createdBriefingId}
      />

      <PendingAttachmentsPanel
        attachments={pendingAttachments}
        disabled={submitting}
        uploading={submitting}
        uploadProgressLabel={uploadProgressLabel}
        onAddPhotos={() => void onAddPhotos()}
        onAddDocuments={() => void onAddDocuments()}
        onRemove={(localId) =>
          setPendingAttachments((current) => current.filter((item) => item.localId !== localId))
        }
      />

      {infoMessage ? <InlineFormMessage message={infoMessage} tone="info" /> : null}
      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <View style={styles.actions}>
        <AppButton
          label={submitLabel}
          onPress={() => {
            if (createdBriefingId && pendingAttachments.length === 0) {
              router.replace(briefingDetailHref(createdBriefingId));
              return;
            }
            void onSubmit();
          }}
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
