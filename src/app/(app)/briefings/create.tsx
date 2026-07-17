import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import {
  BriefingFormFields,
  EMPTY_BRIEFING_FORM,
  PendingAttachmentsPanel,
  TemplateSelect,
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
import { listBriefingCategories } from '@/services/briefing-categories';
import {
  BriefingServiceError,
  createBriefing,
  validateCreateBriefingInput,
} from '@/services/briefings';
import { listBriefingTemplates } from '@/services/briefing-templates';
import { listAgencyShifts } from '@/services/shifts';
import { spacing } from '@/theme';
import {
  ATTACHMENT_MAX_PER_BRIEFING,
  type PendingAttachment,
} from '@/types/briefing-attachments';
import type { BriefingCategory } from '@/types/briefingCategories';
import type { BriefingTemplate } from '@/types/briefingTemplates';
import type { AgencyShift } from '@/types/shifts';

function formHasContent(values: BriefingFormValues): boolean {
  return Boolean(
    values.title.trim() ||
      values.body.trim() ||
      values.category.trim() ||
      values.case_number.trim() ||
      values.location.trim() ||
      values.tagsText.trim() ||
      values.priority !== EMPTY_BRIEFING_FORM.priority ||
      values.requires_acknowledgement !== EMPTY_BRIEFING_FORM.requires_acknowledgement,
  );
}

function applyTemplate(
  values: BriefingFormValues,
  template: BriefingTemplate,
  categories: BriefingCategory[],
): BriefingFormValues {
  const categoryName =
    template.category_name ??
    categories.find((category) => category.id === template.category_id)?.name ??
    values.category;

  return {
    ...values,
    title: template.title_template ?? '',
    body: template.body_template,
    category: categoryName ?? '',
    priority: template.default_priority,
    requires_acknowledgement: template.requires_acknowledgement,
  };
}

export default function CreateBriefingScreen() {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const [agencyShifts, setAgencyShifts] = useState<AgencyShift[]>([]);
  const [agencyCategories, setAgencyCategories] = useState<BriefingCategory[]>([]);
  const [templates, setTemplates] = useState<BriefingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
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

  useEffect(() => {
    const agencyId = currentAgency?.id ?? null;
    let cancelled = false;
    queueMicrotask(() => {
      if (!agencyId) {
        if (!cancelled) {
          setAgencyShifts([]);
          setAgencyCategories([]);
          setTemplates([]);
        }
        return;
      }
      void Promise.all([
        listAgencyShifts({ agencyId, includeInactive: false }).catch(() => [] as AgencyShift[]),
        listBriefingCategories({ agencyId, includeInactive: false }).catch(
          () => [] as BriefingCategory[],
        ),
        listBriefingTemplates({ agencyId, includeInactive: false }).catch(
          () => [] as BriefingTemplate[],
        ),
      ]).then(([shifts, categories, templateRows]) => {
        if (!cancelled) {
          setAgencyShifts(shifts);
          setAgencyCategories(categories);
          setTemplates(templateRows);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [currentAgency?.id]);

  function confirmAndApplyTemplate(template: BriefingTemplate | null) {
    if (!template) {
      setSelectedTemplateId(null);
      return;
    }

    const apply = () => {
      setSelectedTemplateId(template.id);
      setValues((current) => applyTemplate(current, template, agencyCategories));
    };

    if (!formHasContent(values) || selectedTemplateId === template.id) {
      apply();
      return;
    }

    const message =
      'Applying this template will overwrite the current title, body, category, priority, and acknowledgement settings. Continue?';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) {
        apply();
      }
      return;
    }

    Alert.alert('Replace form content?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apply template', style: 'destructive', onPress: apply },
    ]);
  }

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

    const input = briefingFormToInput(values, agencyShifts, agencyCategories);
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

      <TemplateSelect
        templates={templates}
        selectedId={selectedTemplateId}
        disabled={submitting || !!createdBriefingId}
        onSelect={(template) => confirmAndApplyTemplate(template)}
      />

      <BriefingFormFields
        values={values}
        onChange={setValues}
        fieldErrors={fieldErrors}
        disabled={submitting || !!createdBriefingId}
        agencyShifts={agencyShifts}
        agencyCategories={agencyCategories}
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
