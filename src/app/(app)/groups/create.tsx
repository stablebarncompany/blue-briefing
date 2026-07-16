import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';

import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { groupDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { listActiveAgencyPersonnel, type AgencyPersonnel } from '@/services/agency';
import {
  GroupServiceError,
  createGroup,
  validateCreateGroupInput,
} from '@/services/groups';
import { colors, radius, spacing } from '@/theme';
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  canCreateGroups,
  formatGroupAuthorName,
} from '@/types/groups';

export default function CreateGroupScreen() {
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [personnel, setPersonnel] = useState<AgencyPersonnel[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [moderatorIds, setModeratorIds] = useState<string[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const canCreate = canCreateGroups(currentMembership?.role);

  const loadPeople = useCallback(async () => {
    if (!agencyId) {
      setPersonnel([]);
      setLoadingPeople(false);
      return;
    }
    setLoadingPeople(true);
    try {
      const rows = await listActiveAgencyPersonnel(agencyId);
      setPersonnel(rows.filter((row) => row.user_id !== userId));
    } catch {
      setErrorMessage('Unable to load agency personnel for invites.');
      setPersonnel([]);
    } finally {
      setLoadingPeople(false);
    }
  }, [agencyId, userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPeople();
    });
  }, [loadPeople]);

  function toggleMember(userId: string) {
    setSelectedMemberIds((current) => {
      if (current.includes(userId)) {
        setModeratorIds((mods) => mods.filter((id) => id !== userId));
        return current.filter((id) => id !== userId);
      }
      return [...current, userId];
    });
  }

  function toggleModerator(userId: string) {
    if (!selectedMemberIds.includes(userId)) {
      setSelectedMemberIds((current) => [...current, userId]);
    }
    setModeratorIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function onSubmit() {
    if (submitting || !currentAgency?.id || !user?.id) {
      return;
    }
    const input = {
      name,
      description,
      is_private: isPrivate,
      initialMemberIds: selectedMemberIds,
      moderatorIds,
    };
    const validationError = validateCreateGroupInput(input);
    if (validationError) {
      setNameError(!name.trim() ? 'Group name is required.' : null);
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    setNameError(null);
    setErrorMessage(null);
    try {
      const created = await createGroup({
        agencyId: currentAgency.id,
        createdBy: user.id,
        input,
      });
      router.replace(groupDetailHref(created.id));
    } catch (error) {
      setErrorMessage(
        error instanceof GroupServiceError ? error.message : 'Unable to create group.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!currentAgency || !user) {
    return (
      <PageContainer>
        <EmptyState
          title="Agency required"
          description="An active agency membership is required to create groups."
        />
      </PageContainer>
    );
  }

  if (!canCreate) {
    return (
      <PageContainer>
        <EmptyState
          title="Not authorized"
          description="Supervisors, command staff, or agency admins can create groups."
        />
        <AppButton label="Back" variant="ghost" onPress={() => router.back()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <View style={styles.header}>
        <AppText variant="display">Create group</AppText>
        <AppText variant="body" color="textMuted">
          Invite-only channel for selected agency personnel.
        </AppText>
      </View>

      <FormField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Watch channel name"
        autoCapitalize="words"
        maxLength={GROUP_NAME_MAX_LENGTH}
        editable={!submitting}
        error={nameError}
      />

      <FormField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Purpose of this channel"
        autoCapitalize="sentences"
        multiline
        textAlignVertical="top"
        style={styles.description}
        maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
        editable={!submitting}
      />

      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <AppText variant="label" color="textMuted">
            Private / invite-only
          </AppText>
          <AppText variant="caption" color="textSubtle">
            Members must be invited. Self-join is not allowed.
          </AppText>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={setIsPrivate}
          disabled={submitting}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.text}
        />
      </View>

      <View style={styles.people}>
        <AppText variant="title">Initial members</AppText>
        <AppText variant="caption" color="textSubtle">
          You are added automatically as a moderator. Select additional active agency personnel.
        </AppText>
        {loadingPeople ? (
          <AppText variant="caption" color="textMuted">
            Loading personnel…
          </AppText>
        ) : null}
        {!loadingPeople && personnel.length === 0 ? (
          <AppText variant="caption" color="textSubtle">
            No other active agency members available to invite.
          </AppText>
        ) : null}
        {personnel.map((person) => {
          const selected = selectedMemberIds.includes(person.user_id);
          const isMod = moderatorIds.includes(person.user_id);
          return (
            <View key={person.user_id} style={styles.personRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Toggle member ${formatGroupAuthorName(person.profile)}`}
                disabled={submitting}
                onPress={() => toggleMember(person.user_id)}
                style={[styles.personMain, selected ? styles.personSelected : null]}>
                <AppText variant="body">{formatGroupAuthorName(person.profile)}</AppText>
                <AppText variant="caption" color="textSubtle">
                  {person.unit || person.title || person.role}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isMod }}
                accessibilityLabel={`Toggle moderator ${formatGroupAuthorName(person.profile)}`}
                disabled={submitting}
                onPress={() => toggleModerator(person.user_id)}
                style={[styles.modChip, isMod ? styles.modChipSelected : null]}>
                <AppText variant="caption" color={isMod ? 'text' : 'textMuted'}>
                  Mod
                </AppText>
              </Pressable>
            </View>
          );
        })}
      </View>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <View style={styles.actions}>
        <AppButton
          label="Create group"
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
  description: {
    minHeight: 100,
    paddingTop: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  toggleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  people: {
    gap: spacing.md,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  personMain: {
    flex: 1,
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  personSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  modChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  actions: {
    gap: spacing.md,
    marginBottom: spacing['3xl'],
  },
});
