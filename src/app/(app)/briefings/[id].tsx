import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  BriefingFormFields,
  BriefingPriorityBadge,
  briefingFormToInput,
  type BriefingFormValues,
} from '@/components/briefings';
import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import {
  BriefingServiceError,
  acknowledgeBriefing,
  archiveBriefing,
  getBriefing,
  getBriefingAcknowledgements,
  removeAcknowledgement,
  resolveBriefing,
  setBriefingPinned,
  updateBriefing,
  validateCreateBriefingInput,
} from '@/services/briefings';
import { colors, spacing } from '@/theme';
import {
  canEditBriefing,
  canSuperviseBriefings,
  formatAuthorName,
  formatBriefingDateTime,
  type BriefingAckWithProfile,
  type BriefingWithMeta,
} from '@/types/briefings';

function toFormValues(briefing: BriefingWithMeta): BriefingFormValues {
  return {
    title: briefing.title,
    body: briefing.body,
    shift_name: briefing.shift_name ?? '',
    category: briefing.category ?? '',
    priority: briefing.priority,
    case_number: briefing.case_number ?? '',
    location: briefing.location ?? '',
    tagsText: briefing.tags.join(', '),
    requires_acknowledgement: briefing.requires_acknowledgement,
  };
}

export default function BriefingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const briefingId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;

  const [briefing, setBriefing] = useState<BriefingWithMeta | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<BriefingAckWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<BriefingFormValues | null>(null);

  const role = currentMembership?.role;
  const canSupervise = canSuperviseBriefings(role);
  const canEdit = canEditBriefing({
    role,
    authorId: briefing?.author_id ?? '',
    currentUserId: userId,
    status: briefing?.status ?? 'active',
  });

  const load = useCallback(async () => {
    if (!agencyId || !userId || !briefingId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [detail, acks] = await Promise.all([
        getBriefing({
          agencyId,
          briefingId,
          currentUserId: userId,
        }),
        getBriefingAcknowledgements({
          agencyId,
          briefingId,
        }),
      ]);
      setBriefing(detail);
      setAcknowledgements(acks);
      setEditValues(toFormValues(detail));
    } catch (error) {
      const message =
        error instanceof BriefingServiceError
          ? error.message
          : 'Unable to load this briefing.';
      setErrorMessage(message);
      setBriefing(null);
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, briefingId, userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function runAction(actionKey: string, action: () => Promise<void>) {
    if (busyAction) {
      return;
    }
    setBusyAction(actionKey);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (error) {
      const message =
        error instanceof BriefingServiceError
          ? error.message
          : 'Unable to complete that action.';
      setActionError(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function onAcknowledge() {
    if (!agencyId || !userId || !briefing) {
      return;
    }
    await runAction('ack', async () => {
      if (briefing.acknowledged_by_me) {
        await removeAcknowledgement({
          agencyId,
          briefingId: briefing.id,
          userId,
        });
      } else {
        await acknowledgeBriefing({
          agencyId,
          briefingId: briefing.id,
          userId,
        });
      }
    });
  }

  async function onSaveEdit() {
    if (!agencyId || !briefing || !editValues) {
      return;
    }
    const input = briefingFormToInput(editValues);
    const validationError = validateCreateBriefingInput(input);
    if (validationError) {
      setActionError(validationError);
      return;
    }
    await runAction('save', async () => {
      await updateBriefing({
        agencyId,
        briefingId: briefing.id,
        input,
      });
      setEditing(false);
    });
  }

  function onPrint() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    }
  }

  if (!currentAgency) {
    return (
      <PageContainer>
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership before opening briefings."
        />
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading briefing…
          </AppText>
        </View>
      </PageContainer>
    );
  }

  if (errorMessage || !briefing) {
    return (
      <PageContainer>
        <InlineFormMessage message={errorMessage ?? 'Briefing not found.'} />
        <AppButton label="Back to briefings" variant="ghost" onPress={() => router.back()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <View style={styles.header}>
        <AppButton label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
        <View style={styles.metaRow}>
          <BriefingPriorityBadge priority={briefing.priority} />
          <AppText variant="caption" color="textMuted">
            {briefing.status.charAt(0).toUpperCase() + briefing.status.slice(1)}
          </AppText>
          {briefing.is_pinned ? (
            <AppText variant="caption" color="warning">
              Pinned
            </AppText>
          ) : null}
        </View>
        <AppText variant="display">{briefing.title}</AppText>
        <AppText variant="body" color="textMuted">
          {formatAuthorName(briefing.author)} · {formatBriefingDateTime(briefing.created_at)}
        </AppText>
      </View>

      {actionError ? <InlineFormMessage message={actionError} /> : null}

      {editing && editValues ? (
        <AppCard raised style={styles.section}>
          <BriefingFormFields
            values={editValues}
            onChange={setEditValues}
            disabled={busyAction === 'save'}
          />
          <View style={styles.actionRow}>
            <AppButton
              label="Save changes"
              loading={busyAction === 'save'}
              disabled={!!busyAction}
              onPress={() => void onSaveEdit()}
            />
            <AppButton
              label="Cancel edit"
              variant="ghost"
              disabled={!!busyAction}
              onPress={() => {
                setEditing(false);
                setEditValues(toFormValues(briefing));
              }}
            />
          </View>
        </AppCard>
      ) : (
        <AppCard raised style={styles.section}>
          {briefing.shift_name || briefing.category ? (
            <AppText variant="caption" color="textMuted">
              {[briefing.shift_name, briefing.category].filter(Boolean).join(' · ')}
            </AppText>
          ) : null}
          <AppText variant="body">{briefing.body}</AppText>
          {briefing.case_number || briefing.location ? (
            <AppText variant="caption" color="textSubtle">
              {[
                briefing.case_number ? `Case ${briefing.case_number}` : null,
                briefing.location,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          ) : null}
          {briefing.tags.length > 0 ? (
            <AppText variant="caption" color="textMuted">
              Tags: {briefing.tags.join(', ')}
            </AppText>
          ) : null}
        </AppCard>
      )}

      <AppCard style={styles.section}>
        <AppText variant="title">Acknowledgements</AppText>
        <AppText variant="body" color="textMuted">
          {briefing.acknowledgement_count} personnel acknowledged
          {briefing.requires_acknowledgement
            ? briefing.acknowledged_by_me
              ? ' · including you'
              : ' · awaiting your acknowledgement'
            : ' · acknowledgement not required'}
        </AppText>

        {briefing.requires_acknowledgement && briefing.status === 'active' ? (
          <AppButton
            label={briefing.acknowledged_by_me ? 'Remove acknowledgement' : 'Acknowledge'}
            variant={briefing.acknowledged_by_me ? 'ghost' : 'primary'}
            loading={busyAction === 'ack'}
            disabled={!!busyAction}
            onPress={() => void onAcknowledge()}
          />
        ) : null}

        {acknowledgements.length > 0 ? (
          <View style={styles.ackList}>
            {acknowledgements.map((ack) => (
              <View key={ack.id} style={styles.ackRow}>
                <AppText variant="body">{formatAuthorName(ack.profile)}</AppText>
                <AppText variant="caption" color="textSubtle">
                  {formatBriefingDateTime(ack.acknowledged_at)}
                </AppText>
              </View>
            ))}
          </View>
        ) : (
          <AppText variant="caption" color="textSubtle">
            No acknowledgements yet.
          </AppText>
        )}
      </AppCard>

      <View style={styles.actions}>
        {canEdit && !editing ? (
          <AppButton
            label="Edit"
            variant="secondary"
            disabled={!!busyAction}
            onPress={() => setEditing(true)}
          />
        ) : null}

        {canSupervise ? (
          <AppButton
            label={briefing.is_pinned ? 'Unpin' : 'Pin'}
            variant="ghost"
            loading={busyAction === 'pin'}
            disabled={!!busyAction}
            onPress={() =>
              void runAction('pin', async () => {
                await setBriefingPinned({
                  agencyId: currentAgency.id,
                  briefingId: briefing.id,
                  isPinned: !briefing.is_pinned,
                });
              })
            }
          />
        ) : null}

        {canSupervise && briefing.status === 'active' ? (
          <AppButton
            label="Resolve"
            variant="ghost"
            loading={busyAction === 'resolve'}
            disabled={!!busyAction}
            onPress={() =>
              void runAction('resolve', async () => {
                await resolveBriefing({
                  agencyId: currentAgency.id,
                  briefingId: briefing.id,
                });
              })
            }
          />
        ) : null}

        {canSupervise && briefing.status !== 'archived' ? (
          <AppButton
            label="Archive"
            variant="ghost"
            loading={busyAction === 'archive'}
            disabled={!!busyAction}
            onPress={() =>
              void runAction('archive', async () => {
                await archiveBriefing({
                  agencyId: currentAgency.id,
                  briefingId: briefing.id,
                });
              })
            }
          />
        ) : null}

        {Platform.OS === 'web' ? (
          <AppButton label="Print" variant="ghost" onPress={onPrint} />
        ) : null}
      </View>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing['5xl'],
  },
  header: {
    gap: spacing.sm,
  },
  back: {
    alignSelf: 'flex-start',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  section: {
    gap: spacing.md,
  },
  ackList: {
    gap: spacing.sm,
  },
  ackRow: {
    gap: spacing.xxs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginBottom: spacing['3xl'],
  },
  actionRow: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
