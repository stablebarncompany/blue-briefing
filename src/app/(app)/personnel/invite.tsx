import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import {
  EMPTY_INVITE_FORM,
  InviteMemberForm,
  InviteSuccessPanel,
  inviteFormToInput,
  validateInviteMemberFormValues,
  type InviteMemberFormValues,
} from '@/components/personnel';
import { PERSONNEL_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import {
  PersonnelServiceError,
  buildInviteUrl,
  createAgencyInvite,
  ensureAgencyUnit,
  listAgencyUnits,
  listPersonnel,
  uniqueUnitsFromPersonnel,
  validateCreateAgencyInviteInput,
} from '@/services/personnel';
import { spacing } from '@/theme';
import { canManagePersonnel } from '@/types/personnel';

export default function InviteMemberScreen() {
  const { currentAgency, currentMembership } = useAgency();
  const actorRole = currentMembership?.role;
  const allowed = canManagePersonnel(actorRole);
  const agencyId = currentAgency?.id ?? null;

  const [values, setValues] = useState<InviteMemberFormValues>(() => EMPTY_INVITE_FORM(actorRole));
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof InviteMemberFormValues, string>>
  >({});
  const [agencyUnits, setAgencyUnits] = useState<string[]>([]);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!agencyId || !allowed) {
        return;
      }
      let cancelled = false;
      queueMicrotask(() => {
        void Promise.all([listAgencyUnits(agencyId), listPersonnel(agencyId)])
          .then(([units, members]) => {
            if (cancelled) {
              return;
            }
            setAgencyUnits(units.map((unit) => unit.name));
            setKnownUnits(uniqueUnitsFromPersonnel(members));
          })
          .catch(() => {
            if (!cancelled) {
              setAgencyUnits([]);
              setKnownUnits([]);
            }
          });
      });
      return () => {
        cancelled = true;
      };
    }, [agencyId, allowed]),
  );

  async function onSubmit() {
    if (submitting || !currentAgency?.id || !allowed || inviteUrl) {
      return;
    }

    const formErrors = validateInviteMemberFormValues(values);
    const input = inviteFormToInput(values);
    const validationError = validateCreateAgencyInviteInput(input);
    setFieldErrors({
      ...formErrors,
      ...(validationError ? { email: validationError } : {}),
    });
    setErrorMessage(null);

    if (Object.keys(formErrors).length > 0 || validationError) {
      return;
    }

    setSubmitting(true);
    try {
      if (input.unit) {
        await ensureAgencyUnit(currentAgency.id, input.unit);
      }
      const created = await createAgencyInvite(currentAgency.id, input);
      setInviteUrl(buildInviteUrl(created.invite_token));
      setInvitedEmail(created.email);
    } catch (error) {
      const message =
        error instanceof PersonnelServiceError
          ? error.message
          : 'Unable to create invitation.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!allowed) {
    return (
      <PageContainer>
        <EmptyState title="You do not have permission to invite members." />
        <AppButton label="Back to personnel" variant="ghost" onPress={() => router.back()} />
      </PageContainer>
    );
  }

  if (inviteUrl && invitedEmail) {
    return (
      <PageContainer>
        <SectionLabel>Invite member</SectionLabel>
        <InviteSuccessPanel
          inviteUrl={inviteUrl}
          email={invitedEmail}
          onDone={() => {
            setInviteUrl(null);
            setInvitedEmail(null);
            router.replace(PERSONNEL_HREF);
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionLabel>Invite member</SectionLabel>
      <AppText variant="body" color="textMuted">
        Create a secure invitation for {currentAgency?.name ?? 'this agency'}. You will receive a
        one-time link to copy and share manually.
      </AppText>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <InviteMemberForm
        values={values}
        actorRole={actorRole}
        agencyUnits={agencyUnits}
        knownUnits={knownUnits}
        fieldErrors={fieldErrors}
        onChange={setValues}
      />

      <View style={styles.actions}>
        <AppButton
          label="Create invitation"
          onPress={() => void onSubmit()}
          loading={submitting}
          disabled={submitting}
        />
        <AppButton
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          disabled={submitting}
        />
      </View>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
});
