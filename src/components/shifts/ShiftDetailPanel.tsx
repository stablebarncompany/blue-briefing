import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PersonnelIdentity } from '@/components/personnel';
import { canPrintShiftRoster, printShiftRoster } from '@/components/shifts/printShiftRoster';
import {
  ShiftServiceError,
  assignPersonnelToShift,
  assignShiftSupervisor,
  deactivateShift,
  getShift,
  listShiftAssignments,
  listShiftSupervisors,
  reactivateShift,
  removeShiftAssignment,
  removeShiftSupervisor,
  updateShift,
} from '@/services/shifts';
import { listPersonnel } from '@/services/personnel';
import { colors, radius, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import type { PersonnelMember } from '@/types/personnel';
import {
  SHIFT_ASSIGNMENT_TYPES,
  assignmentDisplayName,
  canManageShiftCatalog,
  formatShiftAssignmentType,
  formatShiftHours,
  type AgencyShift,
  type PersonnelShiftAssignment,
  type ShiftAssignmentType,
  type ShiftSupervisor,
} from '@/types/shifts';

export type ShiftDetailPanelProps = {
  agencyId: string;
  shiftId: string;
  agencyName?: string | null;
  role: AgencyRole | null | undefined;
  currentUserId: string;
  onChanged?: () => void;
};

export function ShiftDetailPanel({
  agencyId,
  shiftId,
  agencyName,
  role,
  currentUserId,
  onChanged,
}: ShiftDetailPanelProps) {
  const canManageCatalog = canManageShiftCatalog(role);
  const [shift, setShift] = useState<AgencyShift | null>(null);
  const [assignments, setAssignments] = useState<PersonnelShiftAssignment[]>([]);
  const [supervisors, setSupervisors] = useState<ShiftSupervisor[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shiftCode, setShiftCode] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [assignType, setAssignType] = useState<ShiftAssignmentType>('primary');
  const [supervisorUserId, setSupervisorUserId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nextShift, nextAssignments, nextSupervisors, nextPersonnel] = await Promise.all([
        getShift({ agencyId, shiftId }),
        listShiftAssignments({ agencyId, shiftId, activeOnly: true }),
        listShiftSupervisors({ agencyId, shiftId }),
        listPersonnel(agencyId, { status: 'active' }),
      ]);
      setShift(nextShift);
      setAssignments(nextAssignments);
      setSupervisors(nextSupervisors);
      setPersonnel(nextPersonnel);
      setName(nextShift.name);
      setDescription(nextShift.description ?? '');
      setShiftCode(nextShift.shift_code ?? '');
      setStartTime(nextShift.start_time?.slice(0, 5) ?? '');
      setEndTime(nextShift.end_time?.slice(0, 5) ?? '');
    } catch (error) {
      setErrorMessage(error instanceof ShiftServiceError ? error.message : 'Unable to load shift.');
      setShift(null);
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, shiftId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const assignedIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.user_id)),
    [assignments],
  );
  const supervisorIds = useMemo(
    () => new Set(supervisors.map((supervisor) => supervisor.user_id)),
    [supervisors],
  );
  const canManageAssignments =
    canManageCatalog || supervisors.some((supervisor) => supervisor.user_id === currentUserId);
  const assignable = personnel.filter((person) => !assignedIds.has(person.user_id));
  const supervisorCandidates = personnel.filter((person) => !supervisorIds.has(person.user_id));

  async function runBusy(key: string, action: () => Promise<void>) {
    if (busyAction) {
      return;
    }
    setBusyAction(key);
    setErrorMessage(null);
    try {
      await action();
      await load();
      onChanged?.();
    } catch (error) {
      setErrorMessage(error instanceof ShiftServiceError ? error.message : 'Action failed.');
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="caption" color="textMuted">
          Loading shift…
        </AppText>
      </View>
    );
  }

  if (!shift) {
    return (
      <EmptyState
        title="Shift unavailable"
        description={errorMessage ?? 'This shift could not be loaded.'}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText variant="title">{shift.name}</AppText>
        <AppText variant="caption" color="textSubtle">
          {[
            shift.shift_code ? `Code ${shift.shift_code}` : null,
            formatShiftHours(shift.start_time, shift.end_time),
            shift.is_active ? 'Active' : 'Inactive',
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        {shift.description ? (
          <AppText variant="body" color="textMuted">
            {shift.description}
          </AppText>
        ) : null}
      </View>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {printError ? <InlineFormMessage message={printError} /> : null}

      <View style={styles.actions}>
        {canManageCatalog ? (
          <AppButton
            label={editing ? 'Cancel edit' : 'Edit details'}
            variant="ghost"
            onPress={() => setEditing((value) => !value)}
          />
        ) : null}
        {canPrintShiftRoster() ? (
          <AppButton
            label="Print shift roster"
            variant="ghost"
            onPress={() => {
              setPrintError(null);
              try {
                printShiftRoster({
                  agencyName: agencyName ?? 'Agency',
                  shift,
                  supervisors: supervisors.map(
                    (supervisor) =>
                      `${assignmentDisplayName(supervisor)}${supervisor.is_primary ? ' (primary)' : ''}`,
                  ),
                  assignments,
                });
              } catch (error) {
                setPrintError(error instanceof Error ? error.message : 'Unable to print.');
              }
            }}
          />
        ) : null}
        {canManageCatalog ? (
          <AppButton
            label={shift.is_active ? 'Deactivate' : 'Reactivate'}
            variant="ghost"
            disabled={!!busyAction}
            onPress={() =>
              void runBusy('active', async () => {
                if (shift.is_active) {
                  await deactivateShift({ agencyId, shiftId });
                } else {
                  await reactivateShift({ agencyId, shiftId });
                }
              })
            }
          />
        ) : null}
      </View>

      {editing && canManageCatalog ? (
        <AppCard padded={false} style={styles.editCard}>
          <FormField label="Name" value={name} onChangeText={setName} />
          <FormField label="Code" value={shiftCode} onChangeText={setShiftCode} />
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <FormField
            label="Start time (HH:MM)"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="07:00"
            autoCapitalize="none"
          />
          <FormField
            label="End time (HH:MM)"
            value={endTime}
            onChangeText={setEndTime}
            placeholder="19:00"
            autoCapitalize="none"
          />
          <AppButton
            label="Save shift"
            loading={busyAction === 'save'}
            disabled={!!busyAction}
            onPress={() =>
              void runBusy('save', async () => {
                await updateShift({
                  agencyId,
                  shiftId,
                  input: {
                    name,
                    description,
                    clear_description: !description.trim(),
                    shift_code: shiftCode,
                    clear_shift_code: !shiftCode.trim(),
                    start_time: startTime.trim() || null,
                    clear_start_time: !startTime.trim(),
                    end_time: endTime.trim() || null,
                    clear_end_time: !endTime.trim(),
                  },
                });
                setEditing(false);
              })
            }
          />
        </AppCard>
      ) : null}

      <View style={styles.section}>
        <AppText variant="label" color="textSubtle">
          Supervisors
        </AppText>
        {supervisors.length === 0 ? (
          <AppText variant="caption" color="textMuted">
            No supervisors assigned.
          </AppText>
        ) : (
          supervisors.map((supervisor) => (
            <View key={supervisor.id} style={styles.row}>
              <PersonnelIdentity
                agencyId={agencyId}
                userId={supervisor.user_id}
                displayName={supervisor.display_name}
                preferredName={supervisor.preferred_name}
                firstName={supervisor.first_name}
                lastName={supervisor.last_name}
                rank={supervisor.rank}
                title={supervisor.title}
                unit={supervisor.unit}
                size="sm"
                showMeta
              />
              <AppText variant="caption" color="textSubtle">
                {supervisor.is_primary ? 'Primary supervisor' : 'Supervisor'}
              </AppText>
              {canManageCatalog && supervisor.user_id !== currentUserId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove supervisor"
                  disabled={!!busyAction}
                  onPress={() =>
                    void runBusy(`rm-sup-${supervisor.id}`, async () => {
                      await removeShiftSupervisor({
                        agencyId,
                        supervisorId: supervisor.id,
                      });
                    })
                  }>
                  <AppText variant="caption" color="danger">
                    Remove
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
        {canManageCatalog ? (
          <View style={styles.pickerBlock}>
            <AppText variant="caption" color="textMuted">
              Add supervisor
            </AppText>
            <View style={styles.chipRow}>
              {supervisorCandidates.map((person) => {
                const selected = supervisorUserId === person.user_id;
                return (
                  <Pressable
                    key={person.user_id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSupervisorUserId(person.user_id)}
                    style={[styles.chip, selected ? styles.chipSelected : null]}>
                    <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                      {person.preferred_name ||
                        person.display_name ||
                        [person.first_name, person.last_name].filter(Boolean).join(' ') ||
                        person.email ||
                        'Member'}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <AppButton
              label="Assign supervisor"
              variant="secondary"
              disabled={!supervisorUserId || !!busyAction}
              loading={busyAction === 'add-sup'}
              onPress={() => {
                if (!supervisorUserId) return;
                void runBusy('add-sup', async () => {
                  await assignShiftSupervisor({
                    agencyId,
                    shiftId,
                    userId: supervisorUserId,
                    isPrimary: supervisors.length === 0,
                  });
                  setSupervisorUserId(null);
                });
              }}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <AppText variant="label" color="textSubtle">
          Assigned personnel ({assignments.length})
        </AppText>
        {assignments.length === 0 ? (
          <EmptyState title="No assignments" description="Assign active personnel to this shift." />
        ) : (
          assignments.map((assignment) => (
            <View key={assignment.id} style={styles.assignmentRow}>
              <PersonnelIdentity
                agencyId={agencyId}
                userId={assignment.user_id}
                displayName={assignment.display_name}
                preferredName={assignment.preferred_name}
                firstName={assignment.first_name}
                lastName={assignment.last_name}
                rank={assignment.rank}
                title={assignment.title}
                unit={assignment.unit}
                role={assignment.role}
                size="sm"
                showMeta
              />
              <AppText variant="caption" color="textMuted">
                {formatShiftAssignmentType(assignment.assignment_type)}
                {assignment.badge_number ? ` · Badge ${assignment.badge_number}` : ''}
                {assignment.effective_start || assignment.effective_end
                  ? ` · ${assignment.effective_start ?? '…'} → ${assignment.effective_end ?? '…'}`
                  : ''}
              </AppText>
              {canManageAssignments && assignment.user_id !== currentUserId ? (
                <View style={styles.inlineActions}>
                  {assignment.assignment_type !== 'primary' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Set primary"
                      disabled={!!busyAction}
                      onPress={() =>
                        void runBusy(`primary-${assignment.id}`, async () => {
                          await assignPersonnelToShift({
                            agencyId,
                            shiftId,
                            input: {
                              userId: assignment.user_id,
                              assignmentType: 'primary',
                              effectiveStart: assignment.effective_start,
                              effectiveEnd: assignment.effective_end,
                            },
                          });
                        })
                      }>
                      <AppText variant="caption" color="primary">
                        Set primary
                      </AppText>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove assignment"
                    disabled={!!busyAction}
                    onPress={() =>
                      void runBusy(`rm-${assignment.id}`, async () => {
                        await removeShiftAssignment({
                          agencyId,
                          assignmentId: assignment.id,
                        });
                      })
                    }>
                    <AppText variant="caption" color="danger">
                      Remove
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}

        {canManageAssignments ? (
          <View style={styles.pickerBlock}>
            <AppText variant="caption" color="textMuted">
              Add personnel
            </AppText>
            <View style={styles.chipRow}>
              {SHIFT_ASSIGNMENT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityState={{ selected: assignType === type }}
                  onPress={() => setAssignType(type)}
                  style={[styles.chip, assignType === type ? styles.chipSelected : null]}>
                  <AppText variant="caption" color={assignType === type ? 'text' : 'textMuted'}>
                    {formatShiftAssignmentType(type)}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <View style={styles.chipRow}>
              {assignable.length === 0 ? (
                <AppText variant="caption" color="textSubtle">
                  All active personnel are already assigned.
                </AppText>
              ) : (
                assignable.map((person) => {
                  const selected = assignUserId === person.user_id;
                  return (
                    <Pressable
                      key={person.user_id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setAssignUserId(person.user_id)}
                      style={[styles.chip, selected ? styles.chipSelected : null]}>
                      <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                        {person.preferred_name ||
                          person.display_name ||
                          [person.first_name, person.last_name].filter(Boolean).join(' ') ||
                          person.email ||
                          'Member'}
                      </AppText>
                    </Pressable>
                  );
                })
              )}
            </View>
            <AppButton
              label="Assign selected"
              variant="secondary"
              disabled={
                !assignUserId ||
                !!busyAction ||
                (assignUserId === currentUserId && !canManageCatalog)
              }
              loading={busyAction === 'assign'}
              onPress={() => {
                if (!assignUserId) return;
                void runBusy('assign', async () => {
                  await assignPersonnelToShift({
                    agencyId,
                    shiftId,
                    input: {
                      userId: assignUserId,
                      assignmentType: assignType,
                    },
                  });
                  setAssignUserId(null);
                });
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing['3xl'],
  },
  header: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  editCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  assignmentRow: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pickerBlock: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
